import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

export function getInitials(name: string) {
	const words = name.split(' ');
	if (words.length === 1) return words[0].charAt(0).toUpperCase();
	return words[0].charAt(0).toUpperCase() + words[1].charAt(0).toUpperCase();
}

export function formatDate(
	date?: Date | string | number | null,
	monthType: 'short' | 'long' = 'short'
) {
	if (!date) return '';
	return new Date(date).toLocaleDateString('en-US', {
		year: 'numeric',
		month: monthType,
		day: 'numeric'
	});
}

type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second';

export function timeAgo(input: Date | string) {
	const date = typeof input === 'string' ? new Date(input) : input;
	if (isNaN(date.getTime())) return '';
	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	const diff = Math.floor((Date.now() - date.getTime()) / 1000);
	const intervals: Record<Unit, number> = {
		year: 31536000,
		month: 2592000,
		week: 604800,
		day: 86400,
		hour: 3600,
		minute: 60,
		second: 1
	};
	for (const unit of Object.keys(intervals) as Unit[]) {
		const seconds = intervals[unit];
		const value = Math.floor(diff / seconds);
		if (Math.abs(value) >= 1) {
			return rtf.format(-value, unit);
		}
	}
	return 'just now';
}
