-- Bestehende Konten auf kanonische E-Mail-Adressen (klein, ohne Leerzeichen)
-- umstellen. Schlägt bei zwei Konten, die sich nur in der Schreibweise
-- unterscheiden, an der Unique-Constraint fehl - dann manuell zusammenführen.
UPDATE "users" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));
