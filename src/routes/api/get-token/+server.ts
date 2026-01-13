/**
 * Token Relay API Endpoint
 *
 * This endpoint securely fetches an ephemeral token from Azure OpenAI
 * and returns it to the client for direct WebSocket connection.
 *
 * The "Relay" pattern ensures API keys are never exposed to the client.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const AZURE_OPENAI_ENDPOINT = env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_DEPLOYMENT = env.AZURE_OPENAI_DEPLOYMENT;

export const GET: RequestHandler = async () => {
	// Validate environment variables
	if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY || !AZURE_OPENAI_DEPLOYMENT) {
		console.error('Missing Azure OpenAI configuration');
		return json(
			{ error: 'Server configuration error' },
			{ status: 500 }
		);
	}

	try {
		// Construct the WebSocket URL for Azure OpenAI Realtime API
		// Format: wss://{resource}.openai.azure.com/openai/realtime?api-version=2024-10-01-preview&deployment={deployment}
		const endpoint = AZURE_OPENAI_ENDPOINT.replace('https://', 'wss://').replace(/\/$/, '');
		const wsUrl = `${endpoint}/openai/realtime?api-version=2024-10-01-preview&deployment=${AZURE_OPENAI_DEPLOYMENT}`;

		// For Azure OpenAI, we return the API key as the "token"
		// In production, you might want to implement ephemeral token exchange
		// if Azure supports it for the Realtime API
		return json({
			url: wsUrl,
			token: AZURE_OPENAI_API_KEY
		});

	} catch (err) {
		console.error('Token generation error:', err);
		return json(
			{ error: 'Failed to generate token' },
			{ status: 500 }
		);
	}
};

/**
 * Alternative implementation using OpenAI's ephemeral token endpoint
 * (Use this if Azure supports ephemeral tokens for Realtime API)
 */
/*
async function getEphemeralToken(): Promise<{ token: string; expires_at: number }> {
	const response = await fetch(`${AZURE_OPENAI_ENDPOINT}/openai/realtime/sessions?api-version=2024-10-01-preview`, {
		method: 'POST',
		headers: {
			'api-key': AZURE_OPENAI_API_KEY,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: AZURE_OPENAI_DEPLOYMENT,
			modalities: ['audio', 'text'],
			voice: 'alloy'
		})
	});

	if (!response.ok) {
		throw new Error(`Ephemeral token request failed: ${response.statusText}`);
	}

	const data = await response.json();
	return {
		token: data.client_secret.value,
		expires_at: new Date(data.client_secret.expires_at).getTime()
	};
}
*/
