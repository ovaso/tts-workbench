export interface AppNavItem {
  title: string;
  icon: string;
  to: string;
}

// appNavItems: 无入参；输出左侧导航菜单配置。
export function appNavItems(): AppNavItem[] {
  return [
    {
      title: "快速合成",
      icon: "mdi-waveform",
      to: "/synthesize"
    },
    {
      title: "实时仿真",
      icon: "mdi-access-point-network",
      to: "/realtime-simulator"
    },
    {
      title: "音色管理",
      icon: "mdi-account-voice",
      to: "/voice-clone"
    },
    {
      title: "语料库",
      icon: "mdi-book-open-page-variant-outline",
      to: "/corpora"
    },
    {
      title: "Benches",
      icon: "mdi-chart-box-outline",
      to: "/benches"
    },
    {
      title: "Arena",
      icon: "mdi-scale-balance",
      to: "/arena"
    },
    {
      title: "厂商",
      icon: "mdi-server",
      to: "/providers"
    }
  ];
}
