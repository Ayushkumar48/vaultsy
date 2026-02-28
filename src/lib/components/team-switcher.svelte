<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AudioWaveformIcon from '@lucide/svelte/icons/audio-waveform';
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<Sidebar.MenuButton
			size="lg"
			class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
		>
			<div
				class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
			>
				<AudioWaveformIcon class="size-4" />
			</div>
			<span class="truncate font-medium"> ENV Manager </span>
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
</Sidebar.Menu>
