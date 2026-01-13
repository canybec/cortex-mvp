/**
 * Entity Extraction Service
 *
 * Uses GPT to extract entities and relationships from conversation text.
 * Feeds both the database AND real-time visualization.
 */

import type { Entity, Relationship, EntityType, RelationshipType } from './schema';
import { graphStore, createEntityObject, createRelationshipObject } from './cosmos';

interface ExtractionResult {
	entities: Entity[];
	relationships: Relationship[];
	raw: ExtractedData;
}

interface ExtractedData {
	entities: Array<{
		name: string;
		type: EntityType;
		properties?: Record<string, unknown>;
	}>;
	relationships: Array<{
		from: string;
		to: string;
		type: RelationshipType;
		weight?: number;
	}>;
}

/**
 * Extract entities and relationships from text using GPT
 */
export async function extractFromText(text: string): Promise<ExtractionResult> {
	try {
		const response = await fetch('/api/extract', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text })
		});

		if (!response.ok) {
			console.error('Extraction API failed:', response.statusText);
			return { entities: [], relationships: [], raw: { entities: [], relationships: [] } };
		}

		const data: ExtractedData = await response.json();
		return await processExtraction(data);
	} catch (err) {
		console.error('Entity extraction error:', err);
		return { entities: [], relationships: [], raw: { entities: [], relationships: [] } };
	}
}

/**
 * Process extraction results - dedupe and store
 */
async function processExtraction(data: ExtractedData): Promise<ExtractionResult> {
	const newEntities: Entity[] = [];
	const newRelationships: Relationship[] = [];
	const entityNameToId: Map<string, string> = new Map();

	// Process entities
	for (const extracted of data.entities) {
		// Check if entity already exists
		const existing = await graphStore.findEntitiesByName(extracted.name);
		const exactMatch = existing.find(
			e => e.name.toLowerCase() === extracted.name.toLowerCase() && e.type === extracted.type
		);

		if (exactMatch) {
			// Increment mentions for existing entity
			await graphStore.incrementMentions(exactMatch.id);
			entityNameToId.set(extracted.name.toLowerCase(), exactMatch.id);
		} else {
			// Create new entity
			const entity = createEntityObject(
				extracted.type,
				extracted.name,
				extracted.properties || {}
			);
			await graphStore.createEntity(entity);
			newEntities.push(entity);
			entityNameToId.set(extracted.name.toLowerCase(), entity.id);
		}
	}

	// Process relationships
	for (const extracted of data.relationships) {
		const fromId = entityNameToId.get(extracted.from.toLowerCase());
		const toId = entityNameToId.get(extracted.to.toLowerCase());

		if (fromId && toId) {
			// Check if relationship already exists
			const existingRels = await graphStore.findRelationshipsFrom(fromId);
			const exists = existingRels.find(
				r => r.toEntityId === toId && r.type === extracted.type
			);

			if (!exists) {
				const relationship = createRelationshipObject(
					fromId,
					toId,
					extracted.type,
					extracted.weight || 0.5
				);
				await graphStore.createRelationship(relationship);
				newRelationships.push(relationship);
			}
		}
	}

	return {
		entities: newEntities,
		relationships: newRelationships,
		raw: data
	};
}

/**
 * Quick extraction for real-time use (simpler, faster)
 * Uses pattern matching for immediate feedback, then GPT for deeper extraction
 */
export function quickExtract(text: string): ExtractedData {
	const entities: ExtractedData['entities'] = [];
	const relationships: ExtractedData['relationships'] = [];

	// Simple pattern matching for immediate UI feedback
	// People patterns (names, titles)
	const peoplePatterns = [
		/\b(my\s+)?(boss|manager|wife|husband|spouse|friend|mom|dad|mother|father|brother|sister|colleague|coworker)\b/gi,
		/\b([A-Z][a-z]+)\s+(said|told|asked|wants|needs)/g, // "Sarah said..."
		/\bwith\s+([A-Z][a-z]+)\b/g, // "meeting with Sarah"
	];

	// Project/task patterns
	const projectPatterns = [
		/\b(the\s+)?([A-Z][a-z]+\s+)?(project|report|presentation|meeting|deadline)\b/gi,
		/\bneed to\s+(.+?)(?:\.|,|$)/gi,
		/\bhave to\s+(.+?)(?:\.|,|$)/gi,
	];

	// Emotion patterns
	const emotionPatterns = [
		/\b(stressed|anxious|worried|excited|happy|sad|frustrated|overwhelmed|motivated)\b/gi,
		/\b(don't want to|dreading|avoiding|afraid of)\s+(.+?)(?:\.|,|$)/gi,
	];

	// Time patterns
	const timePatterns = [
		/\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|next week)\b/gi,
		/\bdue\s+(on\s+)?(.+?)(?:\.|,|$)/gi,
	];

	// Extract people
	for (const pattern of peoplePatterns) {
		const matches = text.matchAll(pattern);
		for (const match of matches) {
			const name = match[1] || match[2] || match[0];
			if (name && name.length > 2) {
				entities.push({
					name: name.trim(),
					type: 'person',
					properties: { raw: match[0] }
				});
			}
		}
	}

	// Extract tasks/projects
	for (const pattern of projectPatterns) {
		const matches = text.matchAll(pattern);
		for (const match of matches) {
			const name = match[1] || match[0];
			if (name && name.length > 3) {
				const type = name.toLowerCase().includes('project') ? 'project' : 'task';
				entities.push({
					name: name.trim(),
					type,
					properties: { raw: match[0] }
				});
			}
		}
	}

	// Extract emotions
	for (const pattern of emotionPatterns) {
		const matches = text.matchAll(pattern);
		for (const match of matches) {
			const emotion = match[1] || match[0];
			if (emotion) {
				entities.push({
					name: emotion.trim(),
					type: 'emotion',
					properties: { raw: match[0] }
				});
			}
		}
	}

	// Infer relationships from context
	// "stressed about the project" -> emotion -> causes_anxiety -> project
	if (text.match(/stressed|anxious|worried/i)) {
		const tasks = entities.filter(e => e.type === 'task' || e.type === 'project');
		const emotions = entities.filter(e => e.type === 'emotion');

		for (const task of tasks) {
			for (const emotion of emotions) {
				if (['stressed', 'anxious', 'worried'].some(e => emotion.name.toLowerCase().includes(e))) {
					relationships.push({
						from: task.name,
						to: 'user',
						type: 'causes_anxiety',
						weight: 0.7
					});
				}
			}
		}
	}

	// Dedupe entities by name
	const seen = new Set<string>();
	const uniqueEntities = entities.filter(e => {
		const key = `${e.type}:${e.name.toLowerCase()}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	return { entities: uniqueEntities, relationships };
}

/**
 * Process a conversation message and update the graph
 */
export async function processMessage(
	message: string,
	role: 'user' | 'assistant'
): Promise<ExtractionResult> {
	// Only extract from user messages (they contain the real context)
	if (role !== 'user') {
		return { entities: [], relationships: [], raw: { entities: [], relationships: [] } };
	}

	// Quick extraction for immediate UI feedback
	const quickResults = quickExtract(message);

	// Store quick results immediately
	const entities: Entity[] = [];
	const relationships: Relationship[] = [];

	for (const extracted of quickResults.entities) {
		const existing = await graphStore.findEntitiesByName(extracted.name);
		const exactMatch = existing.find(
			e => e.name.toLowerCase() === extracted.name.toLowerCase()
		);

		if (exactMatch) {
			await graphStore.incrementMentions(exactMatch.id);
		} else {
			const entity = createEntityObject(extracted.type, extracted.name, extracted.properties || {});
			await graphStore.createEntity(entity);
			entities.push(entity);
		}
	}

	// TODO: Queue full GPT extraction in background for deeper analysis
	// This runs after quick extraction for richer relationship detection

	return {
		entities,
		relationships,
		raw: quickResults
	};
}
