/**
 * Context Injection Service
 *
 * Builds the "State of the Union" context that gets injected
 * into Cortex's system prompt before each session.
 *
 * This is what makes Cortex "telepathic" - it knows about:
 * - Overdue tasks and upcoming deadlines
 * - Recently discussed topics and people
 * - Inferred emotional state
 * - Active projects and relationships
 */

import type { UserContext, Entity, Relationship } from './schema';
import { graphStore } from './cosmos';

/**
 * Build the user's current context from the knowledge graph
 */
export async function buildUserContext(userId: string): Promise<UserContext> {
	const now = new Date();
	const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

	// Get all entities
	const allEntities = await graphStore.getAllEntities();
	const allRelationships = await graphStore.getAllRelationships();

	// Find task entities
	const tasks = allEntities.filter(e => e.type === 'task');
	const projects = allEntities.filter(e => e.type === 'project');

	// Find overdue tasks (entities with deadline relationships in the past)
	const overdueTasks = findOverdueTasks(tasks, allRelationships, now);

	// Find upcoming deadlines
	const upcomingDeadlines = findUpcomingDeadlines(tasks, allRelationships, now);

	// Find frequently mentioned people
	const people = allEntities.filter(e => e.type === 'person');
	const frequentPeople = people
		.sort((a, b) => b.mentions - a.mentions)
		.slice(0, 5)
		.map(person => ({
			name: person.name,
			relationship: inferRelationship(person, allRelationships),
			recentMentions: person.mentions
		}));

	// Find recent topics
	const topics = allEntities.filter(e => e.type === 'topic');
	const recentTopics = topics
		.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
		.slice(0, 5)
		.map(t => t.name);

	// Infer mood from emotion entities and anxiety relationships
	const emotions = allEntities.filter(e => e.type === 'emotion');
	const anxietyRelations = allRelationships.filter(
		r => r.type === 'causes_anxiety' || r.type === 'dreads'
	);

	const { inferredMood, stressLevel } = inferMood(emotions, anxietyRelations, overdueTasks);

	return {
		id: `context-${userId}-${now.toISOString()}`,
		userId,
		currentTime: now.toISOString(),
		dayOfWeek,
		overdueTasks,
		upcomingDeadlines,
		inferredMood,
		stressLevel,
		recentTopics,
		frequentPeople,
		createdAt: now.toISOString()
	};
}

/**
 * Find tasks that are past their deadline
 */
function findOverdueTasks(
	tasks: Entity[],
	relationships: Relationship[],
	now: Date
): UserContext['overdueTasks'] {
	const overdue: UserContext['overdueTasks'] = [];

	for (const task of tasks) {
		// Look for deadline relationship
		const deadlineRel = relationships.find(
			r => r.fromEntityId === task.id && r.type === 'has_deadline'
		);

		if (deadlineRel && deadlineRel.properties.date) {
			const deadline = new Date(deadlineRel.properties.date as string);
			if (deadline < now) {
				const daysOverdue = Math.floor(
					(now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24)
				);
				overdue.push({
					id: task.id,
					name: task.name,
					dueDate: deadline.toISOString(),
					daysOverdue
				});
			}
		}
	}

	return overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * Find tasks with deadlines coming up
 */
function findUpcomingDeadlines(
	tasks: Entity[],
	relationships: Relationship[],
	now: Date
): UserContext['upcomingDeadlines'] {
	const upcoming: UserContext['upcomingDeadlines'] = [];
	const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

	for (const task of tasks) {
		const deadlineRel = relationships.find(
			r => r.fromEntityId === task.id && r.type === 'has_deadline'
		);

		if (deadlineRel && deadlineRel.properties.date) {
			const deadline = new Date(deadlineRel.properties.date as string);
			if (deadline >= now && deadline <= sevenDaysFromNow) {
				const daysUntil = Math.ceil(
					(deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
				);
				upcoming.push({
					id: task.id,
					name: task.name,
					dueDate: deadline.toISOString(),
					daysUntil
				});
			}
		}
	}

	return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
}

/**
 * Infer the relationship type for a person
 */
function inferRelationship(person: Entity, relationships: Relationship[]): string {
	// Check for explicit relationships
	const rel = relationships.find(
		r => r.toEntityId === person.id || r.fromEntityId === person.id
	);

	if (rel) {
		// Convert relationship type to readable string
		const typeMap: Record<string, string> = {
			reports_to: 'manager',
			manages: 'direct report',
			works_with: 'colleague',
			knows: 'acquaintance',
			family: 'family member'
		};
		return typeMap[rel.type] || rel.type.replace(/_/g, ' ');
	}

	// Fall back to properties
	if (person.properties.relationship) {
		return person.properties.relationship as string;
	}

	return 'mentioned';
}

/**
 * Infer user's mood from emotional patterns
 */
function inferMood(
	emotions: Entity[],
	anxietyRelations: Relationship[],
	overdueTasks: UserContext['overdueTasks']
): { inferredMood: UserContext['inferredMood']; stressLevel: number } {
	let stressLevel = 0;

	// Overdue tasks increase stress
	stressLevel += overdueTasks.length * 1.5;

	// Anxiety relationships increase stress
	stressLevel += anxietyRelations.length * 2;

	// Recent negative emotions increase stress
	const recentEmotions = emotions.filter(e => {
		const age = Date.now() - new Date(e.updatedAt).getTime();
		return age < 24 * 60 * 60 * 1000; // Last 24 hours
	});

	const negativeEmotions = ['stressed', 'anxious', 'worried', 'frustrated', 'overwhelmed'];
	const positiveEmotions = ['happy', 'excited', 'motivated', 'calm'];

	for (const emotion of recentEmotions) {
		if (negativeEmotions.some(neg => emotion.name.toLowerCase().includes(neg))) {
			stressLevel += emotion.mentions;
		}
		if (positiveEmotions.some(pos => emotion.name.toLowerCase().includes(pos))) {
			stressLevel -= emotion.mentions * 0.5;
		}
	}

	// Clamp stress level
	stressLevel = Math.max(0, Math.min(10, stressLevel));

	// Infer mood from stress level
	let inferredMood: UserContext['inferredMood'];
	if (stressLevel >= 8) {
		inferredMood = 'overwhelmed';
	} else if (stressLevel >= 6) {
		inferredMood = 'anxious';
	} else if (stressLevel >= 4) {
		inferredMood = 'stressed';
	} else if (stressLevel >= 2) {
		inferredMood = 'calm';
	} else {
		inferredMood = 'motivated';
	}

	return { inferredMood, stressLevel };
}

/**
 * Generate the system prompt injection for Cortex
 */
export async function generateContextPrompt(userId: string): Promise<string> {
	const context = await buildUserContext(userId);

	const parts: string[] = [];

	// Header
	parts.push(`[CORTEX CONTEXT - ${context.dayOfWeek} ${new Date(context.currentTime).toLocaleDateString()}]`);

	// Overdue tasks (critical)
	if (context.overdueTasks.length > 0) {
		parts.push('\n⚠️ OVERDUE TASKS:');
		for (const task of context.overdueTasks) {
			parts.push(`  - "${task.name}" (${task.daysOverdue} days overdue)`);
		}
	}

	// Upcoming deadlines
	if (context.upcomingDeadlines.length > 0) {
		parts.push('\n📅 UPCOMING DEADLINES:');
		for (const deadline of context.upcomingDeadlines) {
			const urgency = deadline.daysUntil <= 1 ? '🔴' : deadline.daysUntil <= 3 ? '🟡' : '🟢';
			parts.push(`  ${urgency} "${deadline.name}" in ${deadline.daysUntil} day${deadline.daysUntil !== 1 ? 's' : ''}`);
		}
	}

	// Frequent people
	if (context.frequentPeople.length > 0) {
		parts.push('\n👥 PEOPLE IN CONTEXT:');
		for (const person of context.frequentPeople) {
			parts.push(`  - ${person.name} (${person.relationship})`);
		}
	}

	// Recent topics
	if (context.recentTopics.length > 0) {
		parts.push(`\n📌 RECENT TOPICS: ${context.recentTopics.join(', ')}`);
	}

	// Mood indicator
	if (context.inferredMood) {
		const moodEmoji: Record<string, string> = {
			overwhelmed: '😰',
			anxious: '😟',
			stressed: '😓',
			calm: '😌',
			motivated: '💪'
		};
		parts.push(`\n🧠 USER STATE: ${moodEmoji[context.inferredMood] || ''} ${context.inferredMood} (stress: ${context.stressLevel}/10)`);
	}

	// Behavioral guidance based on mood
	if (context.inferredMood === 'overwhelmed' || context.inferredMood === 'anxious') {
		parts.push('\n💡 APPROACH: Be gentle, help prioritize, break tasks into smaller steps.');
	} else if (context.stressLevel >= 4) {
		parts.push('\n💡 APPROACH: Be supportive but focused. Help identify the single most important next step.');
	}

	parts.push('\n[END CONTEXT]');

	return parts.join('\n');
}

/**
 * Lightweight context summary for quick injection
 */
export async function getQuickContext(userId: string): Promise<string | null> {
	const allEntities = await graphStore.getAllEntities();

	if (allEntities.length === 0) {
		return null; // No context yet
	}

	const tasks = allEntities.filter(e => e.type === 'task' || e.type === 'project');
	const people = allEntities.filter(e => e.type === 'person');
	const recentEntity = allEntities.sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
	)[0];

	const parts: string[] = [];

	if (tasks.length > 0) {
		parts.push(`Known tasks: ${tasks.map(t => t.name).join(', ')}`);
	}

	if (people.length > 0) {
		parts.push(`People mentioned: ${people.map(p => p.name).join(', ')}`);
	}

	if (recentEntity) {
		parts.push(`Last discussed: ${recentEntity.name} (${recentEntity.type})`);
	}

	return parts.length > 0 ? `[Memory: ${parts.join('. ')}]` : null;
}
