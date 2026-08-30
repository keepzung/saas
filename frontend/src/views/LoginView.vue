<template>
  <div class="login-container">
    <div class="hero-background">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
    </div>

    <div class="login-content">
      <div class="header-row">
        <div class="client-logo">
          <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#1a3a5c" />
                <stop offset="50%" stop-color="#2563eb" />
                <stop offset="100%" stop-color="#1a3a5c" />
              </linearGradient>
            </defs>
            <path
              fill="url(#logoGrad)"
              d="M12 1.5 2.5 6v6c0 5.25 4.05 10.2 9.5 11.5 5.45-1.3 9.5-6.25 9.5-11.5V6L12 1.5zm0 4.6 6 2.85v3.05c0 3.75-2.55 7.3-6 8.35-3.45-1.05-6-4.6-6-8.35V8.95l6-2.85z"
            />
            <path
              fill="url(#logoGrad)"
              d="M12 8.2 8.8 9.75v2.3c0 1.95 1.35 3.8 3.2 4.35 1.85-.55 3.2-2.4 3.2-4.35v-2.3L12 8.2z"
            />
          </svg>
        </div>
        <h1 class="system-name">{{ auth.systemName }}</h1>
      </div>

      <div class="system-info">
        <p class="system-desc">智能商业营销 · 数据驱动增长</p>
      </div>

      <div class="login-form-wrapper">
        <a-form :model="form" layout="vertical" @finish="handleSubmit">
          <a-form-item
            name="phone"
            :rules="[{ required: true, message: '请输入手机号' }]"
          >
            <a-input
              v-model:value="form.phone"
              size="large"
              placeholder="手机号"
              @pressEnter="handleSubmit"
            >
              <template #prefix>
                <UserOutlined style="color: rgba(30, 41, 59, 0.35)" />
              </template>
            </a-input>
          </a-form-item>

          <a-form-item
            name="password"
            :rules="[{ required: true, message: '请输入密码' }]"
          >
            <a-input-password
              v-model:value="form.password"
              size="large"
              placeholder="密码"
              @pressEnter="handleSubmit"
            >
              <template #prefix>
                <LockOutlined style="color: rgba(30, 41, 59, 0.35)" />
              </template>
            </a-input-password>
          </a-form-item>

          <a-form-item style="margin-bottom: 8px">
            <a-button
              type="primary"
              size="large"
              block
              :loading="loading"
              html-type="submit"
            >
              登录
            </a-button>
          </a-form-item>
        </a-form>
      </div>

      <p class="login-footer">Marketine · 内部演示环境</p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const form = reactive({ phone: '', password: '' });
const loading = ref(false);

async function handleSubmit() {
  if (!form.phone || !form.password) return;
  loading.value = true;
  try {
    await auth.login(form.phone, form.password);
    message.success('登录成功');
    router.push(route.query.redirect || '/welcome');
  } catch (e) {
    message.error(e.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  position: fixed;
  inset: 0;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

.hero-background {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background:
    radial-gradient(ellipse 80% 60% at 70% 20%, rgba(52, 86, 230, 0.35), transparent 60%),
    radial-gradient(ellipse 70% 55% at 20% 80%, rgba(37, 99, 235, 0.28), transparent 60%),
    linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #1a3a5c 100%);
  z-index: 1;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(64px);
  opacity: 0.5;
  animation: float 12s ease-in-out infinite;
}

.orb-1 {
  width: 380px;
  height: 380px;
  left: 12%;
  top: 18%;
  background: radial-gradient(circle, #3456e6, transparent 70%);
}

.orb-2 {
  width: 300px;
  height: 300px;
  right: 15%;
  bottom: 14%;
  background: radial-gradient(circle, #2563eb, transparent 70%);
  animation-delay: -4s;
}

.orb-3 {
  width: 220px;
  height: 220px;
  right: 32%;
  top: 12%;
  background: radial-gradient(circle, #6683c3, transparent 70%);
  animation-delay: -8s;
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(24px, -18px) scale(1.06);
  }
}

.login-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 400px;
  padding: 32px 36px;
  z-index: 2;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.35));
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.06),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.4);
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 24px;
}

.client-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 36px;
}

.system-name {
  font-size: 30px;
  font-weight: 700;
  background: linear-gradient(135deg, #1a3a5c, #2563eb, #1a3a5c);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
  margin: 0;
  white-space: nowrap;
  flex-shrink: 0;
}

.system-info {
  text-align: center;
  margin-bottom: 32px;
  width: 100%;
}

.system-desc {
  font-size: 20px;
  color: #4b5563;
  line-height: 1.4;
  font-weight: 700;
  opacity: 0.8;
  margin: 0;
}

.login-form-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.login-footer {
  margin: 16px 0 0;
  font-size: 12px;
  color: rgba(30, 41, 59, 0.4);
}

@media screen and (max-width: 768px) {
  .system-name {
    font-size: 22px;
  }

  .system-desc {
    font-size: 15px;
  }

  .login-content {
    margin: 0 16px;
    padding: 24px;
  }
}
</style>
