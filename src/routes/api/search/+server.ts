/**
 * Search API Endpoint
 *
 * Provides web search capability for the Thinking Tier.
 * Abstracts the search provider (Bing, Tavily, etc.) for easy swapping.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

// Search provider configuration
const BING_SEARCH_KEY = env.BING_SEARCH_KEY;
const BING_SEARCH_ENDPOINT = env.BING_SEARCH_ENDPOINT || 'https://api.bing.microsoft.com/v7.0/search';
const TAVILY_API_KEY = env.TAVILY_API_KEY;

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

interface SearchResponse {
	results: SearchResult[];
	source: string;
}

/**
 * Search using Bing Search API v7
 */
async function searchBing(query: string, count: number = 5): Promise<SearchResult[]> {
	if (!BING_SEARCH_KEY) {
		throw new Error('BING_SEARCH_KEY not configured');
	}

	const url = new URL(BING_SEARCH_ENDPOINT);
	url.searchParams.set('q', query);
	url.searchParams.set('count', count.toString());
	url.searchParams.set('responseFilter', 'Webpages');

	const response = await fetch(url.toString(), {
		headers: {
			'Ocp-Apim-Subscription-Key': BING_SEARCH_KEY
		}
	});

	if (!response.ok) {
		const error = await response.text();
		console.error('Bing Search error:', error);
		throw new Error(`Bing Search failed: ${response.statusText}`);
	}

	const data = await response.json();
	const webPages = data.webPages?.value || [];

	return webPages.map((page: { name: string; url: string; snippet: string }) => ({
		title: page.name,
		url: page.url,
		snippet: page.snippet
	}));
}

/**
 * Search using Tavily API (optimized for AI agents)
 */
async function searchTavily(query: string, count: number = 5): Promise<SearchResult[]> {
	if (!TAVILY_API_KEY) {
		throw new Error('TAVILY_API_KEY not configured');
	}

	const response = await fetch('https://api.tavily.com/search', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			api_key: TAVILY_API_KEY,
			query,
			search_depth: 'basic',
			max_results: count,
			include_answer: true
		})
	});

	if (!response.ok) {
		const error = await response.text();
		console.error('Tavily Search error:', error);
		throw new Error(`Tavily Search failed: ${response.statusText}`);
	}

	const data = await response.json();
	const results = data.results || [];

	return results.map((result: { title: string; url: string; content: string }) => ({
		title: result.title,
		url: result.url,
		snippet: result.content
	}));
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { query, count = 5 } = await request.json();

		if (!query) {
			return json({ error: 'Query is required' }, { status: 400 });
		}

		let results: SearchResult[] = [];
		let source = 'none';

		// Try Bing first, then Tavily as fallback
		if (BING_SEARCH_KEY) {
			try {
				results = await searchBing(query, count);
				source = 'bing';
			} catch (err) {
				console.error('Bing search failed, trying Tavily:', err);
			}
		}

		if (results.length === 0 && TAVILY_API_KEY) {
			try {
				results = await searchTavily(query, count);
				source = 'tavily';
			} catch (err) {
				console.error('Tavily search failed:', err);
			}
		}

		if (results.length === 0) {
			return json({
				error: 'No search provider configured or all searches failed',
				results: [],
				source: 'none'
			}, { status: 503 });
		}

		const response: SearchResponse = { results, source };
		return json(response);

	} catch (err) {
		console.error('Search endpoint error:', err);
		return json({ error: 'Search failed' }, { status: 500 });
	}
};
