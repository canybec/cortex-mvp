/**
 * GraphRAG Module
 *
 * Exports all GraphRAG functionality for knowledge graph operations.
 */

// Schema types
export type {
	Entity,
	EntityType,
	Relationship,
	RelationshipType,
	Conversation,
	ConversationMessage,
	UserContext,
	UserProfile,
	GraphQuery,
	GraphQueryResult
} from './schema';

// Database operations
export {
	graphStore,
	generateId,
	createEntityObject,
	createRelationshipObject
} from './cosmos';

// Entity extraction
export {
	extractFromText,
	quickExtract,
	processMessage
} from './extraction';

// Context injection
export {
	buildUserContext,
	generateContextPrompt,
	getQuickContext
} from './context';
