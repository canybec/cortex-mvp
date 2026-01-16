/**
 * Think API Endpoint
 *
 * Delegates complex analysis to GPT-5.2 for deeper reasoning.
 * Now includes web search capability for factual queries.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

// Support separate endpoint/key for chat models (may be different Azure resource)
const AZURE_CHAT_ENDPOINT = env.AZURE_CHAT_ENDPOINT || env.AZURE_OPENAI_ENDPOINT;
const AZURE_CHAT_KEY = env.AZURE_CHAT_KEY || env.AZURE_OPENAI_API_KEY;
const THINK_MODEL = env.AZURE_CHAT_MODEL || 'gpt-4o';

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

/**
 * Determine if a query needs web search
 */
function needsWebSearch(query: string): boolean {
	const searchTriggers = [
		// Real-time data patterns
		/\b(current|latest|recent|today|yesterday|this week|this month|this year)\b/i,
		/\b(weather|temperature|forecast)\b/i,
		/\b(stock|price|market|trading)\b/i,
		/\b(news|headlines|announced)\b/i,

		// Factual/research patterns
		/\b(how much|how many|what is the|who is|when did|where is)\b/i,
		/\b(statistics|data|numbers|percentage|rate)\b/i,
		/\b(compare|comparison|vs|versus)\b/i,
		/\b(research|study|studies|according to)\b/i,

		// Location-specific
		/\b(in \w+|near \w+|around \w+)\b.*\b(area|city|region|state)\b/i,

		// Time-sensitive
		/\b(last|past)\s+\d+\s+(days?|weeks?|months?|years?)\b/i
	];

	return searchTriggers.some(pattern => pattern.test(query));
}

/**
 * Perform web search via our search API
 */
async function performSearch(query: string, baseUrl: string): Promise<SearchResult[]> {
	try {
		// Use internal API call
		const response = await fetch(`${baseUrl}/api/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, count: 5 })
		});

		if (!response.ok) {
			console.error('Search API failed:', response.statusText);
			return [];
		}

		const data = await response.json();
		return data.results || [];
	} catch (err) {
		console.error('Search error:', err);
		return [];
	}
}

/**
 * Format search results for the LLM context
 */
function formatSearchContext(results: SearchResult[]): string {
	if (results.length === 0) return '';

	const formatted = results.map((r, i) =>
		`[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`
	).join('\n\n');

	return `\n\n=== WEB SEARCH RESULTS ===\n${formatted}\n=== END SEARCH RESULTS ===\n\nUse the search results above to answer the user's question accurately. Cite sources when using specific data.`;
}

export const POST: RequestHandler = async ({ request, url }) => {
	if (!AZURE_CHAT_ENDPOINT || !AZURE_CHAT_KEY) {
		return json({ error: 'Server configuration error' }, { status: 500 });
	}

	try {
		const { query, context } = await request.json();

		if (!query) {
			return json({ error: 'Query is required' }, { status: 400 });
		}

		// Check if we need to search for real data
		let searchContext = '';
		if (needsWebSearch(query)) {
			console.log('Query needs web search:', query);
			const baseUrl = `${url.protocol}//${url.host}`;
			const searchResults = await performSearch(query, baseUrl);
			searchContext = formatSearchContext(searchResults);
			console.log(`Found ${searchResults.length} search results`);
		}

		// Call chat model via Azure OpenAI Chat Completions API
		const endpoint = AZURE_CHAT_ENDPOINT.replace(/\/$/, '');
		const apiUrl = `${endpoint}/openai/deployments/${THINK_MODEL}/chat/completions?api-version=2024-12-01-preview`;

		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'api-key': AZURE_CHAT_KEY
			},
			body: JSON.stringify({
				messages: [
					{
						role: 'system',
						content: `You are Cortex's analytical backend. Provide clear, concise analysis.

CRITICAL HONESTY RULES:
- If web search results are provided, USE THEM to answer accurately
- If search results are provided but don't fully answer the question, acknowledge the limitation
- If NO search results are provided and you need real-time data, say: "I don't have access to real-time data for that specific query."
- Only provide specific numbers if you have them from search results or are confident from training data
- ALWAYS cite sources when using data from search results

Guidelines:
- Be thorough but concise (2-4 sentences for simple queries, more for complex)
- Use concrete examples and numbers when you have accurate data
- Structure complex answers with brief bullet points
- Your response will be read aloud, so avoid markdown formatting
- No preamble - get straight to the answer${searchContext}`
					},
					...(context ? [{ role: 'assistant' as const, content: `Recent conversation context: ${context}` }] : []),
					{
						role: 'user',
						content: query
					}
				],
				max_completion_tokens: 500
				// Note: gpt-5.2 only supports default temperature (1)
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Chat model error:', errorText);
			return json({ error: 'Analysis failed' }, { status: 500 });
		}

		const data = await response.json();
		const answer = data.choices?.[0]?.message?.content || 'I couldn\'t complete the analysis.';

		return json({
			answer,
			searched: searchContext.length > 0
		});

	} catch (err) {
		console.error('Think endpoint error:', err);
		return json({ error: 'Analysis failed' }, { status: 500 });
	}
};
