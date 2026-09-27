<template>
  <PageWrapper title="工作台" subtitle="智能内容工厂Pro · 内容生产驾驶舱">
    <div class="wb-container">
      <NoticeBar>
        当前 AI 引擎：{{ health.llm ? `大模型直连（${health.model}）` : '内置模板引擎（LLM_API_KEY 配置后自动切换大模型）' }}
      </NoticeBar>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-num">{{ stats.products }}</div>
          <div class="stat-label">产品/服务</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ stats.images }}</div>
          <div class="stat-label">素材图片</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ stats.strategies }}</div>
          <div class="stat-label">创作策略</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ stats.history }}</div>
          <div class="stat-label">已生成笔记</div>
        </div>
      </div>

      <div class="entry-grid">
        <div class="entry-card" @click="go('/content-pro/content-factory/xhs-image-text-single')">
          <div class="entry-icon" style="background:#eef4ff;color:#3456e6"><EditOutlined /></div>
          <div class="entry-body">
            <div class="entry-title">小红书图文</div>
            <div class="entry-desc">五步向导：写作要求 → 生成 → 编辑 → 配图 → 发布</div>
          </div>
          <RightOutlined class="entry-arrow" />
        </div>
        <div class="entry-card" @click="go('/content-pro/content-factory/xhs-image-text-batch')">
          <div class="entry-icon" style="background:#f4f0ff;color:#7c5cf0"><AppstoreOutlined /></div>
          <div class="entry-body">
            <div class="entry-title">小红书图文(批量)</div>
            <div class="entry-desc">按策略批量生成多篇笔记，后台队列执行</div>
          </div>
          <RightOutlined class="entry-arrow" />
        </div>
        <div class="entry-card" @click="go('/content-pro/config/material')">
          <div class="entry-icon" style="background:#eefaf1;color:#16a34a"><PictureOutlined /></div>
          <div class="entry-body">
            <div class="entry-title">素材库</div>
            <div class="entry-desc">产品图片素材，标签/套图分类管理</div>
          </div>
          <RightOutlined class="entry-arrow" />
        </div>
        <div class="entry-card" @click="go('/content-pro/config/strategies')">
          <div class="entry-icon" style="background:#fff7e9;color:#d97706"><BulbOutlined /></div>
          <div class="entry-body">
            <div class="entry-title">创作策略Pro</div>
            <div class="entry-desc">人设 × 卖点 × 受众，沉淀优秀销售话术</div>
          </div>
          <RightOutlined class="entry-arrow" />
        </div>
      </div>
    </div>
  </PageWrapper>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  EditOutlined,
  AppstoreOutlined,
  PictureOutlined,
  BulbOutlined,
  RightOutlined,
} from '@ant-design/icons-vue';
import PageWrapper from '../../components/PageWrapper.vue';
import NoticeBar from '../../components/NoticeBar.vue';
import { useAuthStore } from '../../stores/auth';
import { aiHealth, getStrategies, getXhsHistory, getMaterialImages } from '../../api/contentpro';
import { getProducts } from '../../api/content';

const router = useRouter();
const auth = useAuthStore();
const brandId = computed(() => auth.currentBrandId ?? 1);

const health = ref({ llm: false, model: 'glm-4-flash' });
const stats = ref({ products: 0, images: 0, strategies: 0, history: 0 });

const go = (path) => router.push(path);

onMounted(async () => {
  try {
    const [h, products, images, strategies, history] = await Promise.all([
      aiHealth(),
      getProducts({ brandId: brandId.value }),
      getMaterialImages({ brandId: brandId.value, page: 1, pageSize: 1 }),
      getStrategies({ brandId: brandId.value }),
      getXhsHistory({ brandId: brandId.value, page: 1, pageSize: 1 }),
    ]);
    health.value = h ?? health.value;
    const countProducts = (nodes) => {
      let n = 0;
      for (const x of nodes ?? []) {
        if (x.type === 'product') n += 1;
        n += countProducts(x.children);
      }
      return n;
    };
    stats.value = {
      products: countProducts(products ?? []),
      images: images?.total ?? 0,
      strategies: strategies?.total ?? 0,
      history: history?.total ?? 0,
    };
  } catch {
    /* 忽略，保持 0 */
  }
});
</script>

<style scoped>
.wb-container {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
}

.stat-card {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.stat-num {
  font-size: 28px;
  font-weight: 800;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}

.entry-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  border: 1px solid transparent;
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.2s;
}

.entry-card:hover {
  border-color: #5087ec55;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(52, 86, 230, 0.1);
}

.entry-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex: 0 0 auto;
}

.entry-body {
  flex: 1;
  min-width: 0;
}

.entry-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.entry-desc {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 12.5px;
}

.entry-arrow {
  color: #cbd5e1;
}
</style>
