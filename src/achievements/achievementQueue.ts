import type { Achievement } from './achievementDetection';

export class AchievementQueue {
	private readonly pending: Achievement[] = [];
	private readonly recentIds = new Set<string>();
	private readonly recentIdOrder: string[] = [];
	private current?: Achievement;

	get active(): Achievement | undefined {
		return this.current;
	}

	enqueue(achievement: Achievement): boolean {
		if (this.recentIds.has(achievement.id)) {
			return false;
		}

		this.recentIds.add(achievement.id);
		this.recentIdOrder.push(achievement.id);
		if (this.recentIdOrder.length > 512) {
			const expired = this.recentIdOrder.shift();
			if (expired) {
				this.recentIds.delete(expired);
			}
		}

		if (this.current) {
			this.pending.push(achievement);
		} else {
			this.current = achievement;
		}
		return true;
	}

	finish(): Achievement | undefined {
		this.current = this.pending.shift();
		return this.current;
	}
}
