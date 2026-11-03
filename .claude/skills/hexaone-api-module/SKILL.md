---
name: hexaone-api-module
description: Build or change NestJS backend features in apps/api of the HexaOne ERP — new endpoints, services, DTOs, helpers, permissions, domain events. Use whenever adding or editing API code (controllers, services, modules, guards) so tenant isolation, RBAC, helper/spec split and response shape stay consistent.
---

# HexaOne API module conventions (apps/api)

Stack: NestJS 10, Prisma 5 (PostgreSQL 16), EventEmitter2, BullMQ, Socket.IO. Path alias `@/` → `apps/api/src/`.

## Request pipeline (already global — do not re-add per controller)
1. `TenantMiddleware` — resolves tenant from `x-tenant-id` header or subdomain. Public routes are excluded in `app.module.ts` **and** in the middleware `skip` list — update both when adding a public route.
2. Global guards in order: `ThrottlerGuard` → `JwtAuthGuard` → `TenantGuard` → `RolesGuard` → `PermissionsGuard`.
3. Interceptors: `BranchContextInterceptor`, `AuditInterceptor`; `ResponseInterceptor` wraps everything as `{ success, data, message?, meta? }`.
4. `ValidationPipe` with `whitelist + forbidNonWhitelisted` — **every body field must be declared in the DTO** or the request fails with 400.

Use `@Public()` (`@/common/decorators/public.decorator`) only for genuinely unauthenticated routes.

## Tenant isolation — non-negotiable
- Take tenant from the JWT: `@CurrentUser() user: IAuthUser` → `user.tenantId`. Never trust `tenantId` from body/query.
- Every Prisma query on tenant data includes `tenantId` in `where` (also on `findUnique` → prefer `findFirst({ where: { id, tenantId } })`, and on `update`/`delete` verify ownership first or use `updateMany({ where: { id, tenantId } })`).
- Branch-scoped data also filters by `branchId` (from `user.branchId` / `x-branch-id`); see `src/shared/pos-sales-scope.helper.ts` for the cashier vs manager scoping pattern.
- `SUPER_ADMIN` bypasses tenant and permission guards — platform-only code lives in `modules/platform-ops`.

## Controller pattern
```ts
@ApiTags('Thing')
@ApiBearerAuth('access-token')
@Controller({ path: 'things', version: '1' })   // → /api/v1/things
export class ThingController {
  constructor(private readonly svc: ThingService) {}

  @Get()
  @RequirePermissions('inventory:read')            // all required
  list(@CurrentUser() user: IAuthUser, @Query() q: ListThingDto) {
    return this.svc.list(user.tenantId, q);
  }

  @Post()
  @RequireAnyPermissions('inventory:create', 'purchases:create')  // any one
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateThingDto) {
    return this.svc.create(user.tenantId, user.id, dto);
  }
}
```
- Permission keys are `resource:action` (actions: create/read/update/delete/export…). New resources must be added to the permission seed in `prisma/seed.ts` **and** to role defaults in `src/modules/roles/default-system-roles.ts` (`ensureSystemRoles`) **and** labels in `apps/web/src/lib/permissions.ts` (`RESOURCE_LABELS`, `RESOURCE_ORDER`).
- Vertical-only features: call `assertShopModule(prisma, tenantId, 'expiry')` from `@/shared/shop-module.helper` (see the `hexaone-shop-verticals` skill).

## Service / helper split
- `*.service.ts` = Prisma + side effects. `*.helper.ts` = pure functions (pricing, state transitions, allocation, number formatting) with a sibling `*.helper.spec.ts`. Put business rules in helpers so they are unit-testable without a DB. Examples: `pricing/pricing.helper.ts`, `inventory/inventory-lots.helper.ts`, `workflow/workflow-engine.helper.ts`.
- Multi-step writes that touch stock, money or documents go inside `this.prisma.$transaction(async (tx) => { ... })` (see the sale flow in `pos/pos.module.ts`). Pass `tx` down to helpers that write.
- Throw Nest exceptions (`BadRequestException`, `NotFoundException`, `ForbiddenException`, `ConflictException`); Prisma errors are mapped by `PrismaExceptionFilter`.
- Money: compute with `round2()` from `pricing.helper.ts`; quantities may be fractional (weighted goods) — `Inventory.quantity` is `Float`, round qty to 3 decimals.
- Document numbers (invoice, GRN, PO…) come from `modules/document-numbering` — never hand-roll counters.

## Domain events (EventEmitter2, wildcard, `.` delimiter)
Emit after the transaction commits, e.g. `this.eventEmitter.emit('pos.sale.completed', { saleId, tenantId, branchId, total })`.
Existing listeners: accounting (`accounting-automation.listener.ts`), audit (`audit-log.service.ts`), notifications, mail. Anything that must hit the GL goes through the accounting outbox — see the `hexaone-accounting-posting` skill.

## Module wiring
- New module → register in `src/app.module.ts` imports. Export services other modules need; use `forwardRef(() => X)` for cycles (Inventory ↔ Workflow already does this).
- Several legacy modules keep controller+service inside `*.module.ts` (pos, suppliers, cash-management, tenants, accounting). When editing them, follow the local style; for new code prefer separate `*.controller.ts` / `*.service.ts` / `*.dto.ts`.

## DTOs
class-validator + `@nestjs/swagger` decorators, one line per field:
```ts
@ApiProperty() @IsString() name: string;
@ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) price?: number;
```
Nested arrays need `@ValidateNested({ each: true }) @Type(() => ItemDto)`.

## Verify before finishing
```bash
cd apps/api
pnpm type-check          # tsc --noEmit
pnpm test -- <name>      # jest, rootDir src, *.spec.ts
pnpm build               # nest build (CI runs this)
```
Swagger: http://localhost:3001/api/docs (port from `app.port`).
