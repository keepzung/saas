import { defineStore } from 'pinia';
import request from '../api/request';
import { sha1Hex } from '../utils/sha1';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: null,
    company: null,
    companySourceConfig: null,
    moduleTree: [],
    actions: [],
    brands: [],
    brandRoles: [],
    initialized: false,
    currentBrandId: Number(localStorage.getItem('current_brand_id')) || null,
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    systemName: (state) => {
      if (state.currentBrandId && state.currentBrandId !== 1) {
        const brand = (state.brands ?? []).find(
          (b) => b.id === state.currentBrandId,
        );
        if (brand) return brand.name;
      }
      return state.companySourceConfig?.system_name ?? '智能商业营销系统';
    },
    currentBrand: (state) =>
      state.brands.find((b) => b.id === state.currentBrandId) ?? null,
  },

  actions: {
    async login(phone, password, mainCompanyId) {
      const hashed = sha1Hex(password);
      const data = await request.post('/login', {
        username: phone,
        password: hashed,
        ...(mainCompanyId ? { main_company_id: String(mainCompanyId) } : {}),
      });
      this.token = data.token;
      localStorage.setItem('token', data.token);
    },

    setCurrentBrand(brandId) {
      this.currentBrandId = brandId ?? null;
      if (brandId) localStorage.setItem('current_brand_id', String(brandId));
      else localStorage.removeItem('current_brand_id');
    },

    async initWorkspace() {
      const [info, modules, actionList, brands] = await Promise.all([
        request.get('/user/info'),
        request.get('/user/companymodulelist'),
        request.get('/user/actionlist'),
        request.get('/brand/myList'),
      ]);
      this.user = info;
      this.company = info.company;
      this.companySourceConfig = info.company_source_config;
      this.moduleTree = Array.isArray(modules) ? modules : [];
      this.actions = actionList?.actions ?? [];
      this.brands = brands?.list ?? [];

      if (
        this.currentBrandId &&
        !this.brands.some((b) => b.id === this.currentBrandId)
      ) {
        this.setCurrentBrand(this.brands[0]?.id ?? null);
      }
      if (!this.currentBrandId && this.brands.length > 0) {
        this.setCurrentBrand(this.brands[0].id);
      }

      if (this.brands.length > 0) {
        this.brandRoles = await request.get('/brandMember/myRole');
      }
      this.initialized = true;
      return info;
    },

    hasAction(code) {
      return this.actions.includes(code);
    },

    logout() {
      this.token = '';
      this.user = null;
      this.company = null;
      this.moduleTree = [];
      this.actions = [];
      this.brands = [];
      this.brandRoles = [];
      this.initialized = false;
      localStorage.removeItem('token');
    },
  },
});
