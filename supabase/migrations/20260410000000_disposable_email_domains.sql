-- Disposable Email Domains Blocklist
-- Creates a table of email domains known to belong to disposable/temporary
-- email providers so they can be blocked during signup.
--
-- Source inspiration: https://github.com/disposable-email-domains/disposable-email-domains
-- The initial seed below is a curated subset of the most common providers.
-- Admins can add, remove and maintain the list via the admin dashboard.

-- ============================================================================
-- Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.disposable_email_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('seed', 'admin', 'import')),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT disposable_email_domains_domain_lowercase
    CHECK (domain = lower(domain)),
  CONSTRAINT disposable_email_domains_domain_format
    CHECK (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS disposable_email_domains_domain_key
  ON public.disposable_email_domains (domain);

CREATE INDEX IF NOT EXISTS idx_disposable_email_domains_created_at
  ON public.disposable_email_domains (created_at DESC);

-- Keep updated_at fresh on updates (reuses existing helper)
CREATE TRIGGER set_disposable_email_domains_updated_at
  BEFORE UPDATE ON public.disposable_email_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE public.disposable_email_domains ENABLE ROW LEVEL SECURITY;

-- Admins have full access to manage the list
CREATE POLICY "Admins have full access to disposable email domains"
  ON public.disposable_email_domains FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Note: non-admins cannot SELECT the raw table. The `is_disposable_email_domain`
-- SECURITY DEFINER function below exposes only a boolean, keeping the full list
-- from being enumerated by anonymous users.

-- ============================================================================
-- Boolean check function (usable by anon role during signup)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_disposable_email_domain(p_domain TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.disposable_email_domains
    WHERE domain = lower(trim(p_domain))
  );
$$;

REVOKE ALL ON FUNCTION public.is_disposable_email_domain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_disposable_email_domain(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.is_disposable_email_domain(TEXT) IS
  'Returns TRUE if the supplied domain is present in the disposable_email_domains blocklist. Safe to call from unauthenticated signup flows.';

-- ============================================================================
-- Email-level convenience function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_disposable_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_disposable_email_domain(
    split_part(lower(trim(p_email)), '@', 2)
  );
$$;

REVOKE ALL ON FUNCTION public.is_disposable_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_disposable_email(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.is_disposable_email(TEXT) IS
  'Returns TRUE if the email address uses a domain in the disposable_email_domains blocklist.';

-- ============================================================================
-- Seed list
-- A curated baseline taken from the well-known disposable-email-domains
-- project. Admins may add further entries via the admin dashboard.
-- ============================================================================
INSERT INTO public.disposable_email_domains (domain, source, notes) VALUES
  -- mailinator family
  ('mailinator.com', 'seed', 'Mailinator'),
  ('mailinator.net', 'seed', 'Mailinator'),
  ('mailinator.org', 'seed', 'Mailinator'),
  ('mailinator2.com', 'seed', 'Mailinator'),
  ('notmailinator.com', 'seed', 'Mailinator'),
  ('bobmail.info', 'seed', 'Mailinator alias'),
  ('chammy.info', 'seed', 'Mailinator alias'),
  ('devnullmail.com', 'seed', 'Mailinator alias'),
  ('letthemeatspam.com', 'seed', 'Mailinator alias'),
  ('reallymymail.com', 'seed', 'Mailinator alias'),
  ('reconmail.com', 'seed', 'Mailinator alias'),
  ('safetymail.info', 'seed', 'Mailinator alias'),
  ('sendspamhere.com', 'seed', 'Mailinator alias'),
  ('sogetthis.com', 'seed', 'Mailinator alias'),
  ('spambooger.com', 'seed', 'Mailinator alias'),
  ('spamherelots.com', 'seed', 'Mailinator alias'),
  ('spamhereplease.com', 'seed', 'Mailinator alias'),
  ('spamthisplease.com', 'seed', 'Mailinator alias'),
  ('streetwisemail.com', 'seed', 'Mailinator alias'),
  ('suremail.info', 'seed', 'Mailinator alias'),
  ('thisisnotmyrealemail.com', 'seed', 'Mailinator alias'),
  ('tradermail.info', 'seed', 'Mailinator alias'),
  ('veryrealemail.com', 'seed', 'Mailinator alias'),
  ('zippymail.info', 'seed', 'Mailinator alias'),
  -- 10-minute mail family
  ('10minutemail.com', 'seed', '10MinuteMail'),
  ('10minutemail.net', 'seed', '10MinuteMail'),
  ('10minutemail.org', 'seed', '10MinuteMail'),
  ('10minutemail.co.uk', 'seed', '10MinuteMail'),
  ('10minutemail.de', 'seed', '10MinuteMail'),
  ('10minutesmail.com', 'seed', '10MinuteMail'),
  ('10minmail.com', 'seed', '10MinuteMail variant'),
  ('20minutemail.com', 'seed', '20MinuteMail'),
  ('my10minutemail.com', 'seed', '10MinuteMail variant'),
  -- guerrillamail family
  ('guerrillamail.com', 'seed', 'GuerrillaMail'),
  ('guerrillamail.net', 'seed', 'GuerrillaMail'),
  ('guerrillamail.org', 'seed', 'GuerrillaMail'),
  ('guerrillamail.biz', 'seed', 'GuerrillaMail'),
  ('guerrillamail.de', 'seed', 'GuerrillaMail'),
  ('guerrillamailblock.com', 'seed', 'GuerrillaMail'),
  ('sharklasers.com', 'seed', 'GuerrillaMail alias'),
  ('grr.la', 'seed', 'GuerrillaMail alias'),
  ('pokemail.net', 'seed', 'GuerrillaMail alias'),
  ('spam4.me', 'seed', 'GuerrillaMail alias'),
  -- temp-mail family
  ('temp-mail.org', 'seed', 'Temp-Mail'),
  ('tempmail.com', 'seed', 'TempMail'),
  ('tempmail.net', 'seed', 'TempMail'),
  ('temp-mail.io', 'seed', 'Temp-Mail'),
  ('tempmail.dev', 'seed', 'TempMail'),
  ('tempmail.email', 'seed', 'TempMail'),
  ('tempmail.plus', 'seed', 'TempMail Plus'),
  ('tempmail.us.com', 'seed', 'TempMail'),
  ('tempmailo.com', 'seed', 'TempMail'),
  ('tempinbox.com', 'seed', 'TempInbox'),
  ('tempr.email', 'seed', 'Tempr Email'),
  ('mytempemail.com', 'seed', 'MyTempEmail'),
  ('minuteinbox.com', 'seed', 'MinuteInbox'),
  ('mytemp.email', 'seed', 'MyTemp.email'),
  ('tmpmail.org', 'seed', 'TmpMail'),
  ('tmpmail.net', 'seed', 'TmpMail'),
  ('tmpeml.com', 'seed', 'TmpEml'),
  ('mail.tm', 'seed', 'Mail.tm'),
  ('temp-mail.ru', 'seed', 'Temp-Mail Russia'),
  ('etempmail.com', 'seed', 'ETempMail'),
  ('smailpro.com', 'seed', 'SmailPro'),
  -- yopmail family
  ('yopmail.com', 'seed', 'YopMail'),
  ('yopmail.fr', 'seed', 'YopMail'),
  ('yopmail.net', 'seed', 'YopMail'),
  ('yopmail.org', 'seed', 'YopMail'),
  ('cool.fr.nf', 'seed', 'YopMail alias'),
  ('courriel.fr.nf', 'seed', 'YopMail alias'),
  ('jetable.fr.nf', 'seed', 'YopMail alias'),
  ('moncourrier.fr.nf', 'seed', 'YopMail alias'),
  ('monemail.fr.nf', 'seed', 'YopMail alias'),
  ('monmail.fr.nf', 'seed', 'YopMail alias'),
  -- maildrop + drop-style
  ('maildrop.cc', 'seed', 'MailDrop'),
  ('dropmail.me', 'seed', 'DropMail'),
  -- throwaway / trash
  ('throwawaymail.com', 'seed', 'ThrowAwayMail'),
  ('throwaway.email', 'seed', 'ThrowAway.email'),
  ('throwawayemailaddress.com', 'seed', 'ThrowAwayEmailAddress'),
  ('trashmail.com', 'seed', 'TrashMail'),
  ('trashmail.net', 'seed', 'TrashMail'),
  ('trashmail.org', 'seed', 'TrashMail'),
  ('trash-mail.com', 'seed', 'Trash-Mail'),
  ('trash-mail.de', 'seed', 'Trash-Mail'),
  ('trashmailer.com', 'seed', 'TrashMailer'),
  ('mytrashmail.com', 'seed', 'MyTrashMail'),
  ('trbvm.com', 'seed', 'Trbvm'),
  ('wegwerfmail.de', 'seed', 'Wegwerfmail'),
  ('wegwerfmail.net', 'seed', 'Wegwerfmail'),
  ('wegwerfmail.org', 'seed', 'Wegwerfmail'),
  ('spamdecoy.net', 'seed', 'SpamDecoy'),
  -- fake
  ('fakemail.net', 'seed', 'FakeMail'),
  ('fakeinbox.com', 'seed', 'FakeInbox'),
  ('fakeinbox.info', 'seed', 'FakeInbox'),
  ('fake-mail.net', 'seed', 'Fake-Mail'),
  ('fake-mail.ml', 'seed', 'Fake-Mail'),
  ('dispostable.com', 'seed', 'Dispostable'),
  -- mohmal + arabic
  ('mohmal.com', 'seed', 'Mohmal'),
  ('mohmal.in', 'seed', 'Mohmal'),
  -- burner family
  ('burnermail.io', 'seed', 'BurnerMail'),
  ('burner-email.com', 'seed', 'BurnerEmail'),
  ('burnermailbox.com', 'seed', 'BurnerMailbox'),
  -- french jetable family
  ('jetable.net', 'seed', 'Jetable'),
  ('jetable.org', 'seed', 'Jetable'),
  ('jetable.com', 'seed', 'Jetable'),
  ('mail-temporaire.fr', 'seed', 'Mail Temporaire'),
  -- inboxbear / inboxkitten
  ('inboxbear.com', 'seed', 'InboxBear'),
  ('inboxkitten.com', 'seed', 'InboxKitten'),
  ('kitten.email', 'seed', 'Kitten Email'),
  -- anonymous
  ('anonbox.net', 'seed', 'AnonBox'),
  ('anonymbox.com', 'seed', 'AnonymBox'),
  ('anonymail.dk', 'seed', 'AnonyMail'),
  ('incognitomail.org', 'seed', 'IncognitoMail'),
  -- expire + dead
  ('mailexpire.com', 'seed', 'MailExpire'),
  ('deadaddress.com', 'seed', 'DeadAddress'),
  ('mailnesia.com', 'seed', 'Mailnesia'),
  -- nada family
  ('getnada.com', 'seed', 'GetNada'),
  ('nada.email', 'seed', 'Nada Email'),
  ('nada.ltd', 'seed', 'Nada'),
  -- misc throwaway providers
  ('mintemail.com', 'seed', 'MintEmail'),
  ('zetmail.com', 'seed', 'ZetMail'),
  ('mailcatch.com', 'seed', 'MailCatch'),
  ('filzmail.com', 'seed', 'FilzMail'),
  ('objectmail.com', 'seed', 'ObjectMail'),
  ('instant-mail.de', 'seed', 'Instant-Mail'),
  ('spamgourmet.com', 'seed', 'SpamGourmet'),
  ('spamgourmet.net', 'seed', 'SpamGourmet'),
  ('spamgourmet.org', 'seed', 'SpamGourmet'),
  ('spamavert.com', 'seed', 'SpamAvert'),
  ('spambox.us', 'seed', 'SpamBox'),
  ('fudgerub.com', 'seed', 'FudgeRub'),
  ('unit7lahaina.com', 'seed', 'Unit7Lahaina'),
  ('uroid.com', 'seed', 'Uroid'),
  ('gh2go.com', 'seed', 'Gh2go'),
  ('emltmp.com', 'seed', 'EmlTmp'),
  ('getairmail.com', 'seed', 'GetAirMail'),
  ('discard.email', 'seed', 'Discard Email'),
  ('discardmail.com', 'seed', 'DiscardMail'),
  ('discardmail.de', 'seed', 'DiscardMail'),
  ('mvrht.com', 'seed', 'Mvrht'),
  ('privymail.net', 'seed', 'PrivyMail'),
  ('emailondeck.com', 'seed', 'EmailOnDeck'),
  ('emailtemporarya.com', 'seed', 'EmailTemporaryA'),
  -- fake-identity / test providers
  ('gustr.com', 'seed', 'Gustr / FakeNameGenerator'),
  ('einrot.com', 'seed', 'Einrot / FakeNameGenerator'),
  ('superrito.com', 'seed', 'Superrito / FakeNameGenerator'),
  ('teleworm.us', 'seed', 'Teleworm / FakeNameGenerator'),
  ('dayrep.com', 'seed', 'Dayrep / FakeNameGenerator'),
  ('rhyta.com', 'seed', 'Rhyta / FakeNameGenerator'),
  ('fleckens.hu', 'seed', 'Fleckens / FakeNameGenerator'),
  ('cuvox.de', 'seed', 'Cuvox / FakeNameGenerator'),
  ('armyspy.com', 'seed', 'ArmySpy / FakeNameGenerator'),
  ('jourrapide.com', 'seed', 'Jourrapide / FakeNameGenerator'),
  -- chinese / linshi
  ('linshi-email.com', 'seed', 'Linshi Email'),
  ('linshiyouxiang.net', 'seed', 'LinshiYouxiang'),
  -- misc single-entry providers
  ('safe-mail.net', 'seed', 'Safe-Mail'),
  ('mailnator.com', 'seed', 'MailNator'),
  ('duck2.club', 'seed', 'Duck2 Club'),
  ('gimal.com', 'seed', 'Gimal'),
  ('chatkeep.com', 'seed', 'ChatKeep')
ON CONFLICT (domain) DO NOTHING;
