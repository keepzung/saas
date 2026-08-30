import { Injectable } from '@nestjs/common';

const BUSINESS_ROLES = [
  {
    roleKey: 'agency_manager',
    label: '内容工厂运营主管',
    template_label: '运营主管',
    domain: 'content_center',
    scope: 'workspace',
    storage: 'brand_member',
    assignment_entry: 'brand-member',
  },
  {
    roleKey: 'agency_executive',
    label: '运营执行',
    template_label: '运营执行',
    domain: 'content_center',
    scope: 'workspace',
    storage: 'brand_member',
    assignment_entry: 'brand-member',
  },
  {
    roleKey: 'brand_owner',
    label: '品牌方',
    template_label: '品牌方',
    domain: 'content_center',
    scope: 'workspace',
    storage: 'brand_member',
    assignment_entry: 'brand-member',
  },
  {
    roleKey: 'content_supplier',
    label: '内容供应商',
    template_label: '内容供应商',
    domain: 'content_center',
    scope: 'workspace',
    storage: 'brand_member',
    assignment_entry: 'brand-member',
  },
  {
    roleKey: 'media_partner',
    label: '媒介服务商',
    template_label: '媒介服务商',
    domain: 'content_center',
    scope: 'workspace',
    storage: 'brand_member',
    assignment_entry: 'brand-member',
  },
  {
    roleKey: 'media_supervisor',
    label: '媒介主管',
    template_label: '媒介主管',
    domain: 'kol',
    scope: 'tenant',
    storage: 'company_role_group_user_map',
    assignment_entry: 'role-group',
  },
  {
    roleKey: 'media_executive',
    label: '媒介执行',
    template_label: '媒介执行',
    domain: 'kol',
    scope: 'tenant',
    storage: 'company_role_group_user_map',
    assignment_entry: 'role-group',
  },
  {
    roleKey: 'bff_manager',
    label: '帮发发运营主管',
    template_label: '帮发发主管',
    domain: 'bff',
    scope: 'workspace',
    storage: 'brand_member',
    assignment_entry: 'brand-member',
  },
  {
    roleKey: 'project_manager',
    label: '项目主管',
    template_label: '项目主管',
    domain: 'project',
    scope: 'workspace',
    storage: 'brand_member',
    assignment_entry: 'brand-member',
  },
  {
    roleKey: 'project_member',
    label: '项目参与人',
    template_label: '项目参与人',
    domain: 'project',
    scope: 'project',
    storage: 'project_member',
    assignment_entry: 'project-member',
  },
  {
    roleKey: 'insight_manager',
    label: '智能洞察项目管理',
    template_label: '洞察管理',
    domain: 'brandcosinsight',
    scope: 'workspace',
    storage: 'brand_member',
    assignment_entry: 'brand-member',
  },
  {
    roleKey: 'insight_collaborator',
    label: '智能洞察项目协作人',
    template_label: '洞察协作',
    domain: 'brandcosinsight',
    scope: 'workspace',
    storage: 'brand_member',
    assignment_entry: 'brand-member',
  },
];

const ACTION_ROLE_MAP = {
  canReadWorkspace: ['agency_manager', 'agency_executive', 'brand_owner'],
  canManageBrand: ['agency_manager', 'brand_owner'],
  canSetReviewMode: ['agency_manager'],
  canManagePackage: ['agency_manager', 'agency_executive'],
  canStartAIGenerate: ['agency_manager', 'agency_executive'],
  canInternalReview: ['agency_manager', 'agency_executive'],
  canBrandReview: ['brand_owner'],
  canUploadMaterial: ['agency_manager', 'agency_executive', 'content_supplier'],
  canFillPublishLink: ['media_partner', 'agency_executive'],
  canIssueMaterial: ['agency_manager', 'bff_manager'],
};

@Injectable()
export class AccessService {
  getPolicy() {
    return {
      version: 1,
      formula: [
        'account',
        'tenant_entitlement',
        'application_access',
        'business_role',
        'data_scope',
        'resource_state',
      ],
      systemRole: {
        roleKey: 'system_admin',
        scope: 'tenant',
        controls: ['user_management', 'role_management', 'brand_management'],
        assignmentEntry: 'admin',
      },
      businessRoles: BUSINESS_ROLES,
      contentCenter: {
        actionRoleMap: ACTION_ROLE_MAP,
      },
    };
  }
}
