export const EnvironmentType = ['development', 'staging', 'preview', 'production'] as const;

export type Environment = (typeof EnvironmentType)[number];
