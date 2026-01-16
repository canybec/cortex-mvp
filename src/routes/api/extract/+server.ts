/**
 * Entity Extraction API Endpoint
 *
 * Uses GPT to extract entities and relationships from conversation text.
 * Powers the GraphRAG knowledge graph for persistent memory.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const AZURE_OPENAI_ENDPOINT = env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = env.AZURE_OPENAI_API_KEY;
const EXTRACT_MODEL = 'gpt-4o-mini'; // Fast, cheap model for extraction

// Schema types for extraction output
type EntityType = 'person' | 'project' | 'task' | 'event' | 'place' | 'topic' | 'emotion' | 'habit';
type RelationshipType =
	| 'reports_to' | 'manages' | 'works_with' | 'knows' | 'family'
	| 'works_on' | 'owns' | 'assigned_to' | 'blocked_by' | 'depends_on'
	| 'causes_anxiety' | 'brings_joy' | 'dreads' | 'avoids'
	| 'has_deadline' | 'scheduled_for' | 'overdue'
	| 'located_at' | 'happens_at';

interface ExtractedEntity {
	name: string;
	type: EntityType;
	properties?: Record<string, unknown>;
}

interface ExtractedRelationship {
	from: string;
	to: string;
	type: RelationshipType;
	weight?: number;
}

interface ExtractionResponse {
	entities: ExtractedEntity[];
	relationships: ExtractedRelationship[];
}

const EXTRACTION_PROMPT = `You are an entity extraction system for a personal AI assistant called Cortex.
Your job is to extract entities and relationships from the user's message.

ENTITY TYPES:
- person: People in user's life (boss, spouse, friend, colleague names)
- project: Work or personal projects
- task: Individual tasks or to-dos
- event: Calendar events, appointments, meetings
- place: Locations (office, home, gym, cities)
- topic: Recurring topics or interests
- emotion: Emotional states (stressed, anxious, excited, overwhelmed)
- habit: Recurring behaviors

RELATIONSHIP TYPES:
- reports_to, manages, works_with, knows, family (people relationships)
- works_on, owns, assigned_to, blocked_by, depends_on (task/project relationships)
- causes_anxiety, brings_joy, dreads, avoids (emotional relationships)
- has_deadline, scheduled_for, overdue (temporal relationships)
- located_at, happens_at (location relationships)

RULES:
1. Extract concrete, specific entities (not generic terms)
2. Infer the user entity implicitly - relationships like "works_on" are FROM the user
3. Include emotional states when expressed or implied
4. Weight relationships 0-1 (0.5 default, higher for strong/explicit mentions)
5. Be conservative - only extract what's clearly present

OUTPUT: Return ONLY valid JSON matching this exact structure:
{
  "entities": [
    {"name": "string", "type": "entity_type", "properties": {}}
  ],
  "relationships": [
    {"from": "entity_name", "to": "entity_name", "type": "relationship_type", "weight": 0.5}
  ]
}

If no entities found, return {"entities": [], "relationships": []}`;

export const POST: RequestHandler = async ({ request }) => {
	if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
		console.error('Missing Azure OpenAI configuration');
		return json({ entities: [], relationships: [] }, { status: 200 });
	}

	try {
		const { text } = await request.json();

		if (!text || typeof text !== 'string' || text.trim().length === 0) {
			return json({ entities: [], relationships: [] }, { status: 200 });
		}

		// Skip very short messages (unlikely to have extractable entities)
		if (text.trim().length < 10) {
			return json({ entities: [], relationships: [] }, { status: 200 });
		}

		// Call GPT for entity extraction
		const endpoint = AZURE_OPENAI_ENDPOINT.replace(/\/$/, '');
		const apiUrl = `${endpoint}/openai/deployments/${EXTRACT_MODEL}/chat/completions?api-version=2024-10-01-preview`;

		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'api-key': AZURE_OPENAI_API_KEY
			},
			body: JSON.stringify({
				messages: [
					{
						role: 'system',
						content: EXTRACTION_PROMPT
					},
					{
						role: 'user',
						content: `Extract entities and relationships from this message:\n\n"${text}"`
					}
				],
				max_tokens: 1000,
				temperature: 0.1, // Low temperature for consistent extraction
				response_format: { type: 'json_object' }
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Extraction API error:', errorText);
			return json({ entities: [], relationships: [] }, { status: 200 });
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content;

		if (!content) {
			console.error('No content in extraction response');
			return json({ entities: [], relationships: [] }, { status: 200 });
		}

		// Parse the JSON response
		const extracted: ExtractionResponse = JSON.parse(content);

		// Validate and sanitize the output
		const validEntities = (extracted.entities || []).filter(
			(e): e is ExtractedEntity =>
				typeof e.name === 'string' &&
				e.name.length > 0 &&
				isValidEntityType(e.type)
		);

		const validRelationships = (extracted.relationships || []).filter(
			(r): r is ExtractedRelationship =>
				typeof r.from === 'string' &&
				typeof r.to === 'string' &&
				isValidRelationshipType(r.type)
		);

		console.log(`Extracted ${validEntities.length} entities, ${validRelationships.length} relationships from: "${text.substring(0, 50)}..."`);

		return json({
			entities: validEntities,
			relationships: validRelationships.map(r => ({
				...r,
				weight: typeof r.weight === 'number' ? Math.max(0, Math.min(1, r.weight)) : 0.5
			}))
		});

	} catch (err) {
		console.error('Extraction endpoint error:', err);
		return json({ entities: [], relationships: [] }, { status: 200 });
	}
};

function isValidEntityType(type: string): type is EntityType {
	return ['person', 'project', 'task', 'event', 'place', 'topic', 'emotion', 'habit'].includes(type);
}

function isValidRelationshipType(type: string): type is RelationshipType {
	return [
		'reports_to', 'manages', 'works_with', 'knows', 'family',
		'works_on', 'owns', 'assigned_to', 'blocked_by', 'depends_on',
		'causes_anxiety', 'brings_joy', 'dreads', 'avoids',
		'has_deadline', 'scheduled_for', 'overdue',
		'located_at', 'happens_at'
	].includes(type);
}
