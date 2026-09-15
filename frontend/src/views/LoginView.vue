<template>
  <div class="login-container">
    <div class="hero-background"></div>

    <div class="login-content">
      <div class="header-row">
        <div class="client-logo">
          <img class="logo-img" src="/images/login/logo.png" alt="logo" />
        </div>
        <h1 class="system-name">{{ auth.systemName }}</h1>
      </div>

      <div class="system-info">
        <p class="system-desc">智能商业营销 · 数据驱动增长</p>
      </div>

      <div class="login-form-wrapper">
        <a-form class="login-form" :model="form" @finish="handleSubmit">
          <a-form-item
            name="username"
            :rules="[{ required: true, message: '请输入账号' }]"
          >
            <a-input
              v-model:value="form.phone"
              class="login-input"
              placeholder="请输入账号"
              size="large"
            />
          </a-form-item>

          <a-form-item
            name="password"
            :rules="[{ required: true, message: '请输入密码' }]"
          >
            <a-input-password
              v-model:value="form.password"
              class="login-input"
              placeholder="请输入密码"
              size="large"
              :visibility-toggle="true"
            />
          </a-form-item>

          <div class="login-options">
            <div class="left-options">
              <a-checkbox v-model:checked="remember" class="remember-checkbox">
                <span class="remember-text">记住我</span>
              </a-checkbox>
              <a-tooltip
                placement="top"
                title="请联系您的系统管理员进行密码重置"
              >
                <a class="forgot-link">忘记密码?</a>
              </a-tooltip>
            </div>
          </div>

          <a-button
            type="primary"
            html-type="submit"
            size="large"
            block
            :loading="loading"
            class="btn-donate"
          >
            登录
          </a-button>
        </a-form>
      </div>

      <div class="login-footer"></div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const REMEMBER_KEY = 'remembered_username';

const form = reactive({
  phone: localStorage.getItem(REMEMBER_KEY) || '',
  password: '',
});
const remember = ref(!!localStorage.getItem(REMEMBER_KEY));
const loading = ref(false);

onMounted(() => {
  document.title = `${auth.systemName}`;
});

async function handleSubmit() {
  if (!form.phone || !form.password) return;
  loading.value = true;
  try {
    await auth.login(form.phone, form.password);
    if (remember.value) localStorage.setItem(REMEMBER_KEY, form.phone);
    else localStorage.removeItem(REMEMBER_KEY);
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
  height: 100vh;
  background: #f0f2f5;
  padding: 0;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  position: fixed;
  inset: 0;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: center;
  -webkit-overflow-scrolling: touch;
  overflow: hidden;
}

.hero-background {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background-image: url(/images/login/hero.jpg);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 1;
}

.login-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 400px;
  padding: 32px 36px;
  z-index: 2;
  background: linear-gradient(135deg, #ffffff80, #ffffff59);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px #0000000f, inset 0 0 0 0.5px #fff6;
  mask-image: radial-gradient(ellipse 90% 85% at 50% 50%, black 55%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 90% 85% at 50% 50%, black 55%, transparent 100%);
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 24px;
  width: auto;
  min-width: fit-content;
  max-width: none;
}

.client-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
  height: 1em;
  font-size: 36px;
}

.system-name {
  font-size: 36px;
  font-weight: 700;
  background: linear-gradient(135deg, #1a3a5c, #2563eb, #1a3a5c);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
  text-shadow: none;
  margin: 0;
  display: flex;
  align-items: center;
  white-space: nowrap;
  flex-shrink: 0;
}

.system-info {
  text-align: center;
  margin-bottom: 40px;
  width: 100%;
}

.system-desc {
  font-size: 22px;
  color: #4b5563;
  line-height: 1.4;
  font-weight: 700;
  text-shadow: none;
  margin: 0;
  opacity: 0.8;
}

.login-form-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.logo-img {
  width: auto;
  height: 1em;
  max-width: 100%;
  object-fit: contain;
  margin: 0;
  padding: 0;
  display: block;
}

.login-form {
  width: 100%;
  max-width: 300px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.login-form :deep(.ant-form-item) {
  width: 100%;
  margin-bottom: 12px;
}

.login-input {
  height: 42px !important;
  border-radius: 10px !important;
  background-color: #fff !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
  color: #1a1a1a !important;
  font-size: 13px !important;
  width: 100% !important;
  transition: all 0.2s ease !important;
  padding: 0 14px !important;
  box-shadow: 0 1px 2px #0000000a !important;
  box-sizing: border-box !important;
}

.login-input:hover {
  border-color: #3b82f680 !important;
}

.login-input:focus-within {
  border-color: #3b82f6cc !important;
  box-shadow: 0 0 0 2px #3b82f626 !important;
}

.login-input :deep(.ant-input) {
  background-color: #fff !important;
  border: none !important;
  box-shadow: none !important;
  color: #1a1a1a !important;
  font-size: 13px !important;
  padding: 0 !important;
  height: 100% !important;
}

.login-input :deep(.ant-input::placeholder) {
  color: #0000004d !important;
  font-size: 13px !important;
}

.login-input :deep(.ant-input-password) {
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  height: 100% !important;
  display: flex !important;
  align-items: center !important;
  font-size: 13px !important;
}

.login-input :deep(.ant-input-password .ant-input) {
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: #1a1a1a !important;
  font-size: 13px !important;
  padding: 0 !important;
  height: 100% !important;
  flex: 1 !important;
}

.login-input :deep(.ant-input-password .ant-input::placeholder) {
  color: #0000004d !important;
  font-size: 13px !important;
}

.login-input :deep(.ant-input-password .ant-input-suffix) {
  background-color: transparent !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  margin-left: 8px !important;
}

.login-input :deep(.ant-input-password-icon) {
  color: #6b7280 !important;
  cursor: pointer !important;
  font-size: 16px !important;
  transition: all 0.3s ease !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 20px !important;
  height: 20px !important;
}

.login-input :deep(.ant-input-password-icon:hover) {
  color: #374151 !important;
  transform: scale(1.1) !important;
}

.login-input :deep(*) {
  outline: none !important;
}

.login-input :deep(.ant-input-password-icon svg) {
  color: #6b7280 !important;
  fill: #6b7280 !important;
}

.login-input :deep(input:-webkit-autofill) {
  -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
  -webkit-text-fill-color: #1f2937 !important;
  background-color: #fff !important;
  color: #1f2937 !important;
  transition: background-color 5000s ease-in-out 0s !important;
}

.login-input :deep(input:-webkit-autofill:hover) {
  -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
  -webkit-text-fill-color: #1f2937 !important;
  background-color: #fff !important;
}

.login-input :deep(input:-webkit-autofill:focus) {
  -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
  -webkit-text-fill-color: #1f2937 !important;
  background-color: #fff !important;
}

.login-input :deep(input:-webkit-autofill:active) {
  -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
  -webkit-text-fill-color: #1f2937 !important;
  background-color: #fff !important;
}

.login-input :deep(input:-moz-autofill) {
  background-color: #fff !important;
  color: #1f2937 !important;
  box-shadow: none !important;
}

.login-input :deep(.ant-input-password input:-webkit-autofill) {
  -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
  -webkit-text-fill-color: #1f2937 !important;
  background-color: #fff !important;
  color: #1f2937 !important;
}

.login-options {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
  width: 100%;
}

.left-options {
  display: flex;
  align-items: center;
  gap: 20px;
}

.remember-checkbox,
.remember-text {
  color: #00000073;
  font-size: 12px;
}

.link-text {
  color: #1890ff;
}

.forgot-link {
  color: #1890ff;
  cursor: pointer;
  font-size: 12px;
}

.btn-donate {
  --btn-bg-1: hsla(194 100% 69% / 1);
  --btn-bg-2: hsla(217 100% 56% / 1);
  --radii: 10px;
  position: relative;
  cursor: pointer;
  padding: 0;
  min-width: 120px;
  height: 40px;
  min-height: 40px;
  font-size: 13px;
  font-weight: 500;
  transition: 0.8s;
  background-size: 280% auto;
  background-image: linear-gradient(
    325deg,
    var(--btn-bg-2) 0%,
    var(--btn-bg-1) 55%,
    var(--btn-bg-2) 90%
  );
  border: none;
  border-radius: var(--radii);
  color: #fff;
  box-shadow:
    0 0 20px #47b8ff80,
    0 5px 5px -1px #3a7de940,
    inset 4px 4px 8px #afe6ff80,
    inset -4px -4px 8px #135fd859;
  width: 100%;
  overflow: hidden;
}

.btn-donate:after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(
    120deg,
    transparent 0%,
    rgba(255, 255, 255, 0) 30%,
    rgba(255, 255, 255, 0.35) 50%,
    rgba(255, 255, 255, 0) 70%,
    transparent 100%
  );
  animation: shimmer 3.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  40% {
    left: 150%;
  }
  100% {
    left: 150%;
  }
}

.btn-donate:hover {
  background-position: right top;
}

.btn-donate:is(:focus, :focus-visible, :active) {
  outline: none;
  box-shadow:
    0 0 0 3px #fff,
    0 0 0 6px var(--btn-bg-2);
}

.login-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 10px #3b82f64d;
}

.login-footer {
  margin-top: 24px;
  text-align: center;
  color: #6b7280;
}

.copyright {
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 32px;
  position: relative;
  z-index: 2;
}

@media screen and (max-width: 768px) {
  .login-container {
    height: 100vh;
    height: -webkit-fill-available;
    min-height: 100vh;
    min-height: -webkit-fill-available;
  }

  .hero-background {
    height: 100vh;
    height: -webkit-fill-available;
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn-donate {
    transition: linear;
  }

  .btn-donate:after {
    animation: none;
  }
}
</style>
