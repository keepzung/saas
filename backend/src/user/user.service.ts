import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getInfo(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    return {
      user_id: user.id,
      nickname: user.nickname ?? user.phone,
      mobile: user.phone,
      unionid: '',
      avatar: user.avatar,
      area: null,
      admin_flag: user.adminFlag,
      ckt_flag: user.cktFlag,
      company: {
        main_company_id: user.company.id,
        company_name: user.company.name,
        admin_flag: user.company.adminFlag,
        ckt_flag: 0,
        source_config: user.company.sourceConfig,
        user_company_status: user.company.userCompanyStatus,
      },
      company_source_config: {
        source_name: user.company.sourceConfig,
        system_name: user.company.systemName,
        system_desc: user.company.systemDesc,
        logo_url_full: user.company.logoUrlFull,
        logo_url_less: user.company.logoUrlLess,
        company_type: user.company.companyType,
      },
      brand_vlume_config: [],
      coze_bot_list: [],
      is_bind: 0,
    };
  }

  async getModuleList(userId: number) {
    const nodes = await this.prisma.moduleNode.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });

    const byParent = new Map<number | null, typeof nodes>();
    for (const node of nodes) {
      const list = byParent.get(node.parentId) ?? [];
      list.push(node);
      byParent.set(node.parentId, list);
    }

    const build = (parentId: null | number): unknown[] => {
      const children = byParent.get(parentId) ?? [];
      return children.map((node) => {
        if (node.type === 'feature') {
          return {
            id: node.id,
            name: node.name,
            path: node.path,
            visible: node.visible,
            checked: true,
            start_time: null,
            end_time: null,
          };
        }
        return {
          id: node.key,
          name: node.name,
          icon: node.icon,
          type: node.type,
          description: '',
          start_time: null,
          end_time: null,
          children: build(node.id),
        };
      });
    };

    return build(null);
  }

  async getActionList(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { actions: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return { actions: user.actions };
  }
}
