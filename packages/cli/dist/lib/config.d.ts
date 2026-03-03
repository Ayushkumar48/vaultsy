export type VaultsyConfig = {
    token: string;
    baseUrl: string;
};
export declare function configExists(): boolean;
export declare function readConfig(): VaultsyConfig;
export declare function writeConfig(config: VaultsyConfig): void;
export declare function clearConfig(): void;
//# sourceMappingURL=config.d.ts.map