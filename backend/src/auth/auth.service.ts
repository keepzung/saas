import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EnvelopeResponse } from '../common/interceptors/transform.interceptor';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private async visibleBrands(user: { id: number; role: string }) {
    if (user.role === 'ADMIN') {
      return this.prisma.brand.findMany({
        where: { status: 1 },
        orderBy: { id: 'asc' },
      });
    }
    const members = await this.prisma.brandMember.findMany({
      where: { userId: user.id },
      include: { brand: true },
      orderBy: { brandId: 'asc' },
    });
    return members
      .filter((m) => m.brand.status === 1)
      .map((m) => ({ ...m.brand, roleKey: m.roleKey }));
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.username },
    });
    if (!user) throw new UnauthorizedException('账号或密码错误');

    const ok = bcrypt.compareSync(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');

    const brands = await this.visibleBrands(user);

    if (!dto.main_company_id && brands.length > 1) {
      return new EnvelopeResponse(10015, { user_id: user.id });
    }

    let brandId: number | undefined;
    if (dto.main_company_id) {
      brandId = Number(dto.main_company_id);
      const allowed = brands.some((b) => b.id === brandId);
      if (!allowed) throw new UnauthorizedException('无权访问该工作系统');
    } else if (brands.length === 1) {
      brandId = brands[0].id;
    }

    const payload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      ...(brandId ? { brandId } : {}),
    };
    const token = this.jwt.sign(payload, {
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production',
    });

    return { token, path: '' };
  }

  async companiesByUserId(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) return [];

    const brands = await this.visibleBrands(user);
    const members = await this.prisma.brandMember.findMany({
      where: { userId },
    });
    const roleByBrand = new Map(members.map((m) => [m.brandId, m.roleKey]));

    return brands.map((b) => {
      const isAdmin = user.role === 'ADMIN' || roleByBrand.get(b.id) === 'brand_admin';
      return {
        main_company_id: b.id,
        company_name: b.name,
        admin_flag: isAdmin ? 1 : 0,
        admin_flag_text: isAdmin ? '管理员' : '用户',
        nickname_text: user.nickname || user.phone,
      };
    });
  }
}
