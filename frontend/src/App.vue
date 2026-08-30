<template>
  <a-config-provider :locale="zhCN" :theme="theme">
    <router-view />
  </a-config-provider>
</template>

<script setup>
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

const theme = {
  token: {
    colorPrimary: '#3456E6',
    colorPrimaryHover: '#2c47c2',
    colorInfo: '#3456E6',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorTextBase: '#1e293b',
    colorText: '#1e293b',
    colorTextSecondary: '#64748b',
    colorTextTertiary: '#94a3b8',
    colorBorder: '#e2e8f0',
    colorBorderSecondary: '#f1f5f9',
    colorBgLayout: '#f8fafc',
    colorBgContainer: '#ffffff',
    fontSize: 14,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
    borderRadius: 6,
    borderRadiusSM: 4,
    borderRadiusLG: 16,
    boxShadowCard: '0 1px 3px rgba(0, 0, 0, 0.05)',
    controlHeight: 32,
  },
  components: {
    Layout: {
      siderBg: '#0f172a',
      headerBg: '#ffffff',
      headerHeight: 56,
      bodyBg: '#f8fafc',
    },
    Menu: {
      darkItemBg: '#0f172a',
      darkSubMenuItemBg: '#0f172a',
      darkItemSelectedBg: '#3456E6',
      darkItemColor: 'rgba(255, 255, 255, 0.68)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedColor: '#ffffff',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
      itemBorderRadius: 6,
      itemMarginInline: 8,
      itemHeight: 38,
      iconSize: 15,
    },
    Card: {
      borderRadiusLG: 16,
      boxShadowTertiary: '0 1px 3px rgba(0, 0, 0, 0.05)',
      paddingLG: 20,
    },
    Table: {
      headerBg: '#f8fafc',
      headerColor: '#64748b',
      rowHoverBg: '#f1f5f9',
      borderColor: '#f1f5f9',
    },
    Button: {
      borderRadius: 6,
      controlHeight: 32,
    },
    Statistic: {
      titleFontSize: 13,
      contentFontSize: 24,
    },
    Drawer: {
      borderRadiusLG: 16,
    },
  },
};
</script>
