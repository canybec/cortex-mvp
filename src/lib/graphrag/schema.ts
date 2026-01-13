/**
 * GraphRAG Schema Definitions
 *
 * Defines the structure for the knowledge graph that powers
 * Cortex's persistent memory and contextual awareness.
 */

// ============================================
// ENTITY TYPES
// ============================================

export type EntityType =
	| 'person'      // People in user's life (boss, spouse, friend)
	| 'project'     // Work projects, personal projects
	| 'task'        // Individual tasks/to-dos
	| 'event'       // Calendar events, appointments
	| 'place'       // Locations (office, home, gym)
	| 'topic'       // Recurring topics/interests
	| 'emotion'     // Emotional states tied to entities
	| 'habit'       // Recurring behaviors

export interface Entity {
	id: string;
	type: EntityType;
	name: string;
	properties: Record<string, unknown>;
	embedding?: number[];  // Vector embedding for semantic search
	createdAt: string;
	updatedAt: string;
	mentions: number;      // How often this entity is mentioned
}

// ============================================
// RELATIONSHIP TYPES
// ============================================

export type RelationshipType =
	// People relationships
	| 'reports_to'       // User reports to this person
	| 'manages'          // User manages this person
	| 'works_with'       // Colleague
	| 'knows'            // Personal acquaintance
	| 'family'           // Family member

	// Project/Task relationships
	| 'works_on'         // User works on this project
	| 'owns'             // User owns this task/project
	| 'assigned_to'      // Task assigned to someone
	| 'blocked_by'       // Task blocked by another task
	| 'depends_on'       // Dependency relationship

	// Emotional relationships
	| 'causes_anxiety'   // This entity causes anxiety
	| 'brings_joy'       // This entity brings positive emotion
	| 'dreads'           // User dreads this
	| 'avoids'           // User avoids this

	// Temporal relationships
	| 'has_deadline'     // Entity has a deadline
	| 'scheduled_for'    // Scheduled for a time
	| 'overdue'          // Past deadline

	// Location relationships
	| 'located_at'       // Entity is at this place
	| 'happens_at'       // Event happens at location

export interface Relationship {
	id: string;
	fromEntityId: string;
	toEntityId: string;
	type: RelationshipType;
	weight: number;        // Strength of relationship (0-1)
	properties: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

// ============================================
// CONVERSATION & MEMORY
// ============================================

export interface ConversationMessage {
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
}

export interface Conversation {
	id: string;
	userId: string;
	messages: ConversationMessage[];
	summary?: string;           // AI-generated summary
	extractedEntities: string[]; // Entity IDs mentioned
	embedding?: number[];        // Vector for semantic search
	createdAt: string;
	duration?: number;           // Session duration in seconds
}

// ============================================
// USER CONTEXT (State of the Union)
// ============================================

export interface UserContext {
	id: string;
	userId: string;

	// Current state
	currentTime: string;
	dayOfWeek: string;

	// Task state
	overdueTasks: Array<{
		id: string;
		name: string;
		dueDate: string;
		daysOverdue: number;
	}>;
	upcomingDeadlines: Array<{
		id: string;
		name: string;
		dueDate: string;
		daysUntil: number;
	}>;

	// Emotional state (inferred from recent conversations)
	inferredMood?: 'stressed' | 'calm' | 'anxious' | 'motivated' | 'overwhelmed';
	stressLevel?: number; // 0-10

	// Recent context
	recentTopics: string[];
	lastConversationSummary?: string;

	// Active relationships
	frequentPeople: Array<{
		name: string;
		relationship: string;
		recentMentions: number;
	}>;

	createdAt: string;
}

// ============================================
// USER PROFILE
// ============================================

export interface UserProfile {
	id: string;
	name?: string;

	// Preferences
	preferredPersona: 'dad' | 'therapist' | 'admin' | 'chill';
	aggressionLevel: number; // 1-10, how "pushy" Cortex should be

	// Patterns (learned over time)
	productiveHours?: string[];     // When user is most productive
	avoidancePatterns?: string[];   // Things user tends to avoid
	motivators?: string[];          // What motivates this user

	// Settings
	timezone: string;

	createdAt: string;
	updatedAt: string;
}

// ============================================
// GRAPH QUERY TYPES
// ============================================

export interface GraphQuery {
	// Entity lookup
	entityName?: string;
	entityType?: EntityType;

	// Relationship traversal
	fromEntity?: string;
	relationshipType?: RelationshipType;
	depth?: number;  // How many hops to traverse

	// Semantic search
	semanticQuery?: string;
	topK?: number;
}

export interface GraphQueryResult {
	entities: Entity[];
	relationships: Relationship[];
	context?: string;  // Natural language summary of results
}
