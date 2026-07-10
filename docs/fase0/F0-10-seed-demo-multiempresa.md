# F0-10 Seed demo multiempresa

Fecha: 2026-07-09
Linear: `JAR-34`

## Objetivo

Preparar datos falsos para probar aislamiento multiempresa, roles y reportes sin datos reales.

## Archivos

- SQL draft: `docs/fase0/sql-drafts/f0_seed_demo_multiempresa.sql`

## Organizaciones demo

### Escuela Demo Norte

- slug: `escuela-demo-norte`
- sitio: `Campus A1`
- usuarios:
  - `usuario.a@demo.local`
  - `operador.a@demo.local`
  - `admin.a@demo.local`

### Empresa Demo Sur

- slug: `empresa-demo-sur`
- sitio: `Sucursal B1`
- usuarios:
  - `usuario.b@demo.local`
  - `operador.b@demo.local`
  - `admin.b@demo.local`

### Superadmin demo

- `superadmin@demo.local`

## Pruebas que habilita

1. Usuario A no ve registros B.
2. Operador A no ve sitio B.
3. Admin A no exporta B.
4. Superadmin ve ambos.
5. Signed URL A no se genera para B.

## Notas

- No contiene fotos reales.
- No contiene GPS real de personas.
- Las evidencias usan paths fake en bucket privado.
- Requiere que el modelo Fase 0 exista antes de ejecutar.
