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
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    systemName: (state) =>
      state.companySourceConfig?.system_name ?? '智能商业营销系统',
  },

  actions: {
    async login(phone, password) {
      const hashed = sha1Hex(password);
      const data = await request.post('/login', {
        username: phone,
        password: hashed,
      });
      this.token = data.token;
      localStorage.setItem('token', data.token);
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
