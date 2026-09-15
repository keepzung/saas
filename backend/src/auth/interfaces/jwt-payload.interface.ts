export interface JwtPayload {
  sub: number;
  phone: string;
  role: string;
  brandId?: number;
}
