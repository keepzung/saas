import { computed } from 'vue';
import { Grid } from 'ant-design-vue';

/**
 * 全局断点检测（基于 AntD 栅格断点）
 * - isMobile:  < 768px 手机（含竖屏/横屏）
 * - isTablet:  >= 768px 且 < 992px 平板过渡态
 * - isDesktop: >= 992px 桌面
 */
export function useBreakpoint() {
  const screens = Grid.useBreakpoint();

  const isMobile = computed(() => {
    const s = screens.value || {};
    if (s.md === undefined) {
      // 首帧监听未就绪时按视口宽度兜底
      return typeof window !== 'undefined' && window.innerWidth < 768;
    }
    return s.md === false;
  });

  const isTablet = computed(() => {
    const s = screens.value || {};
    return s.md === true && s.lg === false;
  });

  const isDesktop = computed(() => {
    const s = screens.value || {};
    return s.lg === true;
  });

  return { screens, isMobile, isTablet, isDesktop };
}
