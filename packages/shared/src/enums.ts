export const EnvironmentType = ['development', 'staging', 'preview', 'production'] as const;
export const MemberRole = ['owner', 'admin', 'viewer'] as const;
export const InvitationStatus = ['pending', 'accepted', 'expired'] as const;

export type Environment = (typeof EnvironmentType)[number];
export type MemberRoleType = (typeof MemberRole)[number];
export type InvitationStatusType = (typeof InvitationStatus)[number];
