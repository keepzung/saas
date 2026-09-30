<template>
  <div class="ml-page">
    <div class="ml-card">
      <img src="/images/login/logo.png" class="ml-logo" />
      <div class="ml-sub">智能商业营销系统</div>

      <template v-if="!brandPicking">
        <input
          v-model.trim="form.username"
          class="ml-input"
          type="text"
          inputmode="numeric"
          placeholder="请输入账号"
          autocomplete="username"
        />
        <input
          v-model="form.password"
          class="ml-input"
          type="password"
          placeholder="请输入密码"
          autocomplete="current-password"
          @keyup.enter="submit"
        />
        <button class="ml-btn" type="button" :disabled="loading" @click="submit">
          {{ loading ? '登录中...' : '登 录' }}
        </button>
      </template>

      <!-- 工作系统选择（无 ?co= 参数时） -->
      <template v-else>
        <div class="ml-pick-title">选择工作系统</div>
        <button
          v-for="c in companies"
          :key="c.main_company_id"
          class="ml-company"
          :class="{ selected: selectedCompanyId === c.main_company_id }"
          type="button"
          @click="selectedCompanyId = c.main_company_id"
        >
          <span class="mc-avatar">{{ (c.company_name || '工').charAt(0) }}</span>
          <span class="mc-name">{{ c.company_name }}</span>
          <span v-if="selectedCompanyId === c.main_company_id" class="mc-check">✓</span>
        </button>
        <button class="ml-btn" type="button" :disabled="!selectedCompanyId || confirming" @click="confirmCompany">
          {{ confirming ? '进入中...' : '确认进入' }}
        </button>
        <button class="ml-back" type="button" @click="brandPicking = false">返回重新登录</button>
      </template>
    </div>
    <p class="ml-foot">登录即代表同意以本人账号发布相关内容</p>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { useAuthStore } from '../../stores/auth';
import { getCompaniesByUserId } from '../../api/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const form = reactive({
  username: localStorage.getItem('remembered_username') || '',
  password: localStorage.getItem('remembered_password') || '',
});
const loading = ref(false);
const confirming = ref(false);
const brandPicking = ref(false);
const companies = ref([]);
const selectedCompanyId = ref(null);
const coParam = ref(String(route.query.co ?? '').trim());
const redirect = ref(String(route.query.redirect ?? '/m/kox-task/task-list'));

async function afterBrandReady() {
  auth.initialized = false;
  await auth.initWorkspace().catch(() => undefined);
  router.replace(redirect.value);
}

async function pickAndEnter(companyId) {
  await auth.login(form.username, form.password, companyId);
  auth.setCurrentBrand(companyId);
  localStorage.setItem('remembered_username', form.username);
  localStorage.setItem('remembered_password', form.password);
  message.success('登录成功');
  await afterBrandReady();
}

async function submit() {
  if (!form.username || !form.password) {
    message.warning('请输入账号和密码');
    return;
  }
  loading.value = true;
  try {
    await auth.login(form.username, form.password);
    // 单品牌直达（登录即带品牌 token）
    await afterBrandReady();
    return;
  } catch (e) {
    if (e.code !== 10015) {
      message.error(e.message || '登录失败');
      return;
    }
    try {
      companies.value = await getCompaniesByUserId(e.data?.user_id);
    } catch (err) {
      message.error(err.message || '获取工作系统失败');
      return;
    }
    // ?co=东风奕境：按名称匹配自动直达（旧系统任务领用链接同款）
    if (coParam.value) {
      const hit = companies.value.find((c) => (c.company_name ?? '').includes(coParam.value));
      if (hit) {
        confirming.value = true;
        try {
          await pickAndEnter(hit.main_company_id);
        } catch (err2) {
          message.error(err2.message || '进入工作系统失败');
        } finally {
          confirming.value = false;
        }
        return;
      }
      message.warning(`未找到工作系统「${coParam.value}」，请手动选择`);
    }
    selectedCompanyId.value =
      companies.value.length === 1 ? companies.value[0].main_company_id : null;
    brandPicking.value = true;
  } finally {
    loading.value = false;
  }
}

async function confirmCompany() {
  if (!selectedCompanyId.value) return;
  confirming.value = true;
  try {
    await pickAndEnter(selectedCompanyId.value);
  } catch (e) {
    message.error(e.message || '进入工作系统失败');
  } finally {
    confirming.value = false;
  }
}
</script>

<style scoped>
.ml-page {
  min-height: 100vh;
  background: linear-gradient(160deg, #eef4ff 0%, #f6f2ff 60%, #f8fafc 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.ml-card {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border-radius: 20px;
  padding: 30px 24px 24px;
  box-shadow: 0 12px 34px rgba(52, 86, 230, 0.1);
  display: flex;
  flex-direction: column;
}

.ml-logo {
  height: 34px;
  object-fit: contain;
  align-self: center;
}

.ml-sub {
  margin: 8px 0 22px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
}

.ml-input {
  width: 100%;
  height: 46px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0 14px;
  font-size: 15px;
  margin-bottom: 12px;
  outline: none;
  background: #f8fafc;
  transition: border 0.2s;
}

.ml-input:focus {
  border-color: #3456e6;
  background: #fff;
}

.ml-btn {
  height: 46px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(90deg, #3456e6, #5c6ec8);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
}

.ml-btn:disabled {
  opacity: 0.6;
}

.ml-pick-title {
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 12px;
  font-size: 15px;
}

.ml-company {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 11px 12px;
  margin-bottom: 10px;
  cursor: pointer;
  text-align: left;
}

.ml-company.selected {
  border-color: #3456e6;
  background: #eef4ff;
}

.mc-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #eaf1ff;
  color: #3b82f6;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.mc-name {
  flex: 1;
  color: #1e293b;
  font-size: 14px;
  font-weight: 600;
}

.mc-check {
  color: #3456e6;
  font-weight: 700;
}

.ml-back {
  margin-top: 10px;
  border: none;
  background: none;
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
}

.ml-foot {
  margin-top: 22px;
  color: #b6c2d4;
  font-size: 11px;
  text-align: center;
}
</style>
