-- US-665: inventory_movements -- the kitchen ledger.
--
-- Pantry stock stops being a number that any module may write and becomes a
-- balance derived from an append-only log. Buying appends credits, cooking
-- appends debits, expiry and waste and manual corrections append their own
-- reasons.
--
-- Three things this buys that a mutable quantity cannot:
--
--   Explainable.  "Why does it say I have 3 chicken breasts?" is answerable.
--   Reversible.   Undo is an appended reversal. plan_entry_made_log carries a
--                 reversal_payload JSONB blob today precisely because there is
--                 no ledger; that blob is a hand-rolled inverse of exactly one
--                 operation, and it can retire once this lands (US-677).
--   Replayable.   Movements are idempotent on a client-generated id, so an
--                 offline queue that retries cannot double-count. Today a
--                 replayed deduct silently double-debits.
--
-- APPEND-ONLY, enforced two ways. REVOKE UPDATE/DELETE removes the privilege
-- outright, and RLS carries SELECT and INSERT policies only, so there is no
-- policy for an UPDATE or DELETE to satisfy even if the grant returned. Same
-- belt-and-braces as agent_audit_log (20260709000001).
--
-- A correction is a new row. There is no such thing as editing history here.
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  -- No DEFAULT: the id is supplied by the client precisely so a retry of the
  -- same logical movement collides on this primary key instead of appending a
  -- second copy. That is the whole offline-safety story (criterion 5).
  id UUID PRIMARY KEY,

  household_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.foods(id),

  -- Signed, in canonical_unit. Negative is a debit; cooking and waste are
  -- negative, buying is positive. NOT zero: a movement that moves nothing is
  -- noise in an audit trail.
  delta NUMERIC NOT NULL CHECK (delta <> 0),
  canonical_unit TEXT NOT NULL CHECK (canonical_unit IN ('g', 'ml', 'count')),

  -- What the parent actually said, kept alongside the canonical amount so the
  -- UI can show "2 gal" rather than "7570.82 ml" when explaining a movement.
  display_quantity NUMERIC,
  display_unit TEXT,

  reason TEXT NOT NULL
    CHECK (reason IN ('purchase', 'cook', 'waste', 'expire', 'correction', 'initial')),

  -- What caused this. ref_type is free text rather than an enum so a new
  -- source (a receipt, a delivery) does not need a migration to be recorded.
  ref_type TEXT CHECK (ref_type IS NULL OR ref_type IN ('meal', 'grocery_item', 'receipt', 'merge')),
  ref_id UUID,

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,

  -- Set on the ORIGINAL when a reversal is appended against it. The reversal
  -- itself is an ordinary row; this is the back-pointer that lets the balance
  -- fold exclude both halves. Deliberately the one mutable column, and it is
  -- written only by rpc_reverse_movements_by_ref (US-677), never by a client.
  reversed_by_id UUID REFERENCES public.inventory_movements(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The balance query: everything for one item in a household, in time order.
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx
  ON public.inventory_movements(household_id, item_id, occurred_at);

-- The provenance query: "what did cooking this meal actually move?", which is
-- also how a reversal finds the rows it must reverse.
CREATE INDEX IF NOT EXISTS inventory_movements_ref_idx
  ON public.inventory_movements(ref_type, ref_id)
  WHERE ref_type IS NOT NULL;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Append-only, enforced twice: the privilege is revoked AND no policy exists
-- for the verbs. Either alone would be enough; both means a future migration
-- that restores a grant does not silently reopen history for editing.
-- TRUNCATE is revoked alongside them. Supabase's default grant on a new public
-- table includes it, RLS does not apply to TRUNCATE, and PostgREST does not
-- expose it -- but the privilege being present at all means one statement can
-- erase the entire ledger, which is precisely what an append-only log must not
-- permit. agent_audit_log (20260709000001) revokes only UPDATE and DELETE and
-- has the same hole; worth closing there too, separately from this epic.
REVOKE UPDATE, DELETE, TRUNCATE ON public.inventory_movements FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.inventory_movements FROM anon;

DROP POLICY IF EXISTS "Household members can view inventory movements" ON public.inventory_movements;
CREATE POLICY "Household members can view inventory movements" ON public.inventory_movements
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can append inventory movements" ON public.inventory_movements;
CREATE POLICY "Household members can append inventory movements" ON public.inventory_movements
  FOR INSERT WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

-- Deliberately NO policy for UPDATE or DELETE. Their absence is the enforcement.

COMMENT ON TABLE public.inventory_movements IS
  'US-665: append-only kitchen ledger. Pantry stock is the sum of these, never a number a module writes. Rows are never updated or deleted; a correction is a new row and an undo is an appended reversal.';
COMMENT ON COLUMN public.inventory_movements.id IS
  'US-665: client-generated, deliberately without a default, so retrying the same logical movement collides here instead of double-counting.';
COMMENT ON COLUMN public.inventory_movements.delta IS
  'US-665: signed amount in canonical_unit. Negative debits (cook, waste, expire), positive credits (purchase, initial). Never zero.';
COMMENT ON COLUMN public.inventory_movements.reversed_by_id IS
  'US-665: back-pointer set on an original when a reversal is appended. Written only by rpc_reverse_movements_by_ref (US-677); no client policy permits it.';
