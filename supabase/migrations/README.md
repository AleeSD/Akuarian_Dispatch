# Migraciones — Akuarian Dispatch

Las migraciones de la **Fase 0** (29/06/2026) ya están versionadas en esta carpeta y aplicadas en el
proyecto remoto `ajbkzbtmknlmuucotdol`:

| Versión | Archivo | Qué hace |
|---|---|---|
| `20260629135406` | `..._fase0_numeracion_autocurativa.sql` | Numeración de pedidos robusta + prefijo configurable (Fase 0.1 / 0.6). |
| `20260629135421` | `..._fase0_sellar_tiempos_pedido.sql` | Sella `recogido_en`/`fecha_entrega_real` en toda transición + backfill (Fase 0.3). |
| `20260629135450` | `..._fase0_supervisor_solo_lectura.sql` | RLS: supervisor de solo lectura (Fase 0.4). |

## Pendiente: versionar el esquema histórico previo (Fase 0.2)

Las migraciones anteriores viven **solo en el historial remoto** de Supabase. Para traerlas como
archivos locales (recomendado antes de cualquier cambio estructural mayor), ejecutar con la
Supabase CLI (requiere login + contraseña de la base):

```bash
supabase login
supabase link --project-ref ajbkzbtmknlmuucotdol
supabase db pull        # genera el archivo de esquema base en supabase/migrations/
supabase migration list # verifica que local y remoto coinciden
```

> El historial remoto actual incluye: `fix_resumen_dia_timezone_lima`,
> `fix_repartidor_mis_pedidos_timezone_lima`, `add_subestado_to_pedidos`,
> `security_advisor_fixes`, `rls_least_privilege` y las tres migraciones de Fase 0 listadas arriba.
