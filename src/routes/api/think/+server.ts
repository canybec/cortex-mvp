/**
 * Think API Endpoint
 *
 * Delegates complex analysis to GPT-5.2 for deeper reasoning.
 * Called by the Realtime layer when it detects a complex query.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const AZURE_OPENAI_ENDPOINT = env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = env.AZURE_OPENAI_API_KEY;
const THINK_MODEL = 'gpt-5.2'; // The sophisticated reasoning model

export const POST: RequestHandler = async ({ request }) => {
	if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
		return json({ error: 'Server configuration error' }, { status: 500 });
	}

	try {
		const { query, context } = await request.json();

		if (!query) {
			return json({ error: 'Query is required' }, { status: 400 });
		}

		// Call GPT-5.2 via Azure OpenAI Chat Completions API
		const endpoint = AZURE_OPENAI_ENDPOINT.replace(/\/$/, '');
		const url = `${endpoint}/openai/deployments/${THINK_MODEL}/chat/completions?api-version=2024-10-01-preview`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'api-key': AZURE_OPENAI_API_KEY
			},
			body: JSON.stringify({
				messages: [
					{
						role: 'system',
						content: `You are Cortex's analytical backend. Provide clear, concise analysis.

Guidelines:
- Be thorough but concise (2-4 sentences for simple queries, more for complex)
- Use concrete examples and numbers when relevant
- Structure complex answers with brief bullet points
- Your response will be read aloud, so avoid markdown formatting
- No preamble - get straight to the answer`
					},
					...(context ? [{ role: 'assistant', content: `Recent conversation context: ${context}` }] : []),
					{
						role: 'user',
						content: query
					}
				],
				max_tokens: 500,
				temperature: 0.7
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('GPT-5.2 error:', errorText);
			return json({ error: 'Analysis failed' }, { status: 500 });
		}

		const data = await response.json();
		const answer = data.choices?.[0]?.message?.content || 'I couldn\'t complete the analysis.';

		return json({ answer });

	} catch (err) {
		console.error('Think endpoint error:', err);
		return json({ error: 'Analysis failed' }, { status: 500 });
	}
};
