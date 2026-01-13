/**
 * Cosmos DB Connection Layer for GraphRAG
 *
 * Handles all database operations for the knowledge graph.
 * Uses Cosmos DB with Gremlin API for graph traversal.
 */

import type { Entity, Relationship, Conversation, UserContext, UserProfile } from './schema';

// Environment variables (set in .env)
const COSMOS_ENDPOINT = import.meta.env.VITE_COSMOS_DB_ENDPOINT || '';
const COSMOS_KEY = import.meta.env.VITE_COSMOS_DB_KEY || '';
const DATABASE_NAME = 'cortex';

// Collection names
const COLLECTIONS = {
	entities: 'entities',
	relationships: 'relationships',
	conversations: 'conversations',
	userContext: 'userContext',
	userProfiles: 'userProfiles'
} as const;

/**
 * In-memory store with localStorage persistence for MVP
 * Replace with actual Cosmos DB calls when Azure is configured
 */
class InMemoryGraphStore {
	private entities: Map<string, Entity> = new Map();
	private relationships: Map<string, Relationship> = new Map();
	private conversations: Map<string, Conversation> = new Map();
	private userContexts: Map<string, UserContext> = new Map();
	private userProfiles: Map<string, UserProfile> = new Map();
	private initialized = false;

	private readonly STORAGE_KEY = 'cortex-knowledge-graph';

	constructor() {
		// Load from localStorage on init (client-side only)
		if (typeof window !== 'undefined') {
			this.loadFromStorage();
		}
	}

	/**
	 * Load graph data from localStorage
	 */
	private loadFromStorage(): void {
		if (this.initialized) return;
		this.initialized = true;

		try {
			const stored = localStorage.getItem(this.STORAGE_KEY);
			if (stored) {
				const data = JSON.parse(stored);
				if (data.entities) {
					this.entities = new Map(Object.entries(data.entities));
				}
				if (data.relationships) {
					this.relationships = new Map(Object.entries(data.relationships));
				}
				console.log(`Loaded ${this.entities.size} entities, ${this.relationships.size} relationships from storage`);
			}
		} catch (err) {
			console.warn('Failed to load from localStorage:', err);
		}
	}

	/**
	 * Save graph data to localStorage
	 */
	private saveToStorage(): void {
		if (typeof window === 'undefined') return;

		try {
			const data = {
				entities: Object.fromEntries(this.entities),
				relationships: Object.fromEntries(this.relationships),
				savedAt: new Date().toISOString()
			};
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
		} catch (err) {
			console.warn('Failed to save to localStorage:', err);
		}
	}

	// Entity operations
	async createEntity(entity: Entity): Promise<Entity> {
		this.entities.set(entity.id, entity);
		this.saveToStorage();
		this.notifyListeners('entity:created', entity);
		return entity;
	}

	async getEntity(id: string): Promise<Entity | null> {
		return this.entities.get(id) || null;
	}

	async findEntitiesByName(name: string): Promise<Entity[]> {
		const results: Entity[] = [];
		const searchLower = name.toLowerCase();
		this.entities.forEach(entity => {
			if (entity.name.toLowerCase().includes(searchLower)) {
				results.push(entity);
			}
		});
		return results;
	}

	async findEntitiesByType(type: Entity['type']): Promise<Entity[]> {
		const results: Entity[] = [];
		this.entities.forEach(entity => {
			if (entity.type === type) {
				results.push(entity);
			}
		});
		return results;
	}

	async updateEntity(id: string, updates: Partial<Entity>): Promise<Entity | null> {
		const existing = this.entities.get(id);
		if (!existing) return null;

		const updated = {
			...existing,
			...updates,
			updatedAt: new Date().toISOString()
		};
		this.entities.set(id, updated);
		this.saveToStorage();
		this.notifyListeners('entity:updated', updated);
		return updated;
	}

	async incrementMentions(id: string): Promise<void> {
		const entity = this.entities.get(id);
		if (entity) {
			entity.mentions++;
			entity.updatedAt = new Date().toISOString();
			this.saveToStorage();
			this.notifyListeners('entity:mentioned', entity);
		}
	}

	async getAllEntities(): Promise<Entity[]> {
		return Array.from(this.entities.values());
	}

	// Relationship operations
	async createRelationship(relationship: Relationship): Promise<Relationship> {
		this.relationships.set(relationship.id, relationship);
		this.saveToStorage();
		this.notifyListeners('relationship:created', relationship);
		return relationship;
	}

	async getRelationship(id: string): Promise<Relationship | null> {
		return this.relationships.get(id) || null;
	}

	async findRelationshipsFrom(entityId: string): Promise<Relationship[]> {
		const results: Relationship[] = [];
		this.relationships.forEach(rel => {
			if (rel.fromEntityId === entityId) {
				results.push(rel);
			}
		});
		return results;
	}

	async findRelationshipsTo(entityId: string): Promise<Relationship[]> {
		const results: Relationship[] = [];
		this.relationships.forEach(rel => {
			if (rel.toEntityId === entityId) {
				results.push(rel);
			}
		});
		return results;
	}

	async findRelationshipsByType(type: Relationship['type']): Promise<Relationship[]> {
		const results: Relationship[] = [];
		this.relationships.forEach(rel => {
			if (rel.type === type) {
				results.push(rel);
			}
		});
		return results;
	}

	async getAllRelationships(): Promise<Relationship[]> {
		return Array.from(this.relationships.values());
	}

	// Conversation operations
	async createConversation(conversation: Conversation): Promise<Conversation> {
		this.conversations.set(conversation.id, conversation);
		return conversation;
	}

	async getConversation(id: string): Promise<Conversation | null> {
		return this.conversations.get(id) || null;
	}

	async getRecentConversations(userId: string, limit: number = 10): Promise<Conversation[]> {
		const userConvos = Array.from(this.conversations.values())
			.filter(c => c.userId === userId)
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		return userConvos.slice(0, limit);
	}

	// User context operations
	async setUserContext(context: UserContext): Promise<UserContext> {
		this.userContexts.set(context.userId, context);
		return context;
	}

	async getUserContext(userId: string): Promise<UserContext | null> {
		return this.userContexts.get(userId) || null;
	}

	// User profile operations
	async createOrUpdateProfile(profile: UserProfile): Promise<UserProfile> {
		this.userProfiles.set(profile.id, profile);
		return profile;
	}

	async getProfile(userId: string): Promise<UserProfile | null> {
		return this.userProfiles.get(userId) || null;
	}

	// Graph traversal
	async traverseFromEntity(
		startEntityId: string,
		depth: number = 2
	): Promise<{ entities: Entity[], relationships: Relationship[] }> {
		const visitedEntities = new Set<string>();
		const resultEntities: Entity[] = [];
		const resultRelationships: Relationship[] = [];

		const traverse = async (entityId: string, currentDepth: number) => {
			if (currentDepth > depth || visitedEntities.has(entityId)) return;

			visitedEntities.add(entityId);
			const entity = await this.getEntity(entityId);
			if (entity) resultEntities.push(entity);

			const outgoing = await this.findRelationshipsFrom(entityId);
			const incoming = await this.findRelationshipsTo(entityId);

			for (const rel of [...outgoing, ...incoming]) {
				if (!resultRelationships.find(r => r.id === rel.id)) {
					resultRelationships.push(rel);
				}
				const nextId = rel.fromEntityId === entityId ? rel.toEntityId : rel.fromEntityId;
				await traverse(nextId, currentDepth + 1);
			}
		};

		await traverse(startEntityId, 0);
		return { entities: resultEntities, relationships: resultRelationships };
	}

	// Event system for real-time UI updates
	private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

	subscribe(event: string, callback: (data: unknown) => void): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback);

		// Return unsubscribe function
		return () => {
			this.listeners.get(event)?.delete(callback);
		};
	}

	private notifyListeners(event: string, data: unknown): void {
		this.listeners.get(event)?.forEach(callback => callback(data));
	}

	// Get graph snapshot for visualization
	async getGraphSnapshot(): Promise<{ entities: Entity[], relationships: Relationship[] }> {
		return {
			entities: Array.from(this.entities.values()),
			relationships: Array.from(this.relationships.values())
		};
	}

	// Clear all data (for testing/reset)
	async clear(): Promise<void> {
		this.entities.clear();
		this.relationships.clear();
		this.conversations.clear();
		this.userContexts.clear();
		this.userProfiles.clear();
	}
}

// Singleton instance
export const graphStore = new InMemoryGraphStore();

// Helper to generate IDs
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Factory functions for creating entities
export function createEntityObject(
	type: Entity['type'],
	name: string,
	properties: Record<string, unknown> = {}
): Entity {
	const now = new Date().toISOString();
	return {
		id: generateId(),
		type,
		name,
		properties,
		createdAt: now,
		updatedAt: now,
		mentions: 1
	};
}

export function createRelationshipObject(
	fromEntityId: string,
	toEntityId: string,
	type: Relationship['type'],
	weight: number = 0.5,
	properties: Record<string, unknown> = {}
): Relationship {
	const now = new Date().toISOString();
	return {
		id: generateId(),
		fromEntityId,
		toEntityId,
		type,
		weight,
		properties,
		createdAt: now,
		updatedAt: now
	};
}
