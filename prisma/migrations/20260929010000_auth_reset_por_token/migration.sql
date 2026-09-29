-- Não conceder UPDATE de usuarios ao app_auth. A capacidade abaixo exige
-- token válido e consome-o na mesma operação que altera a senha.
CREATE FUNCTION public.redefinir_senha_por_token(p_token TEXT, p_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  registro public.password_reset_tokens%ROWTYPE;
  alterados INTEGER;
BEGIN
  IF p_token IS NULL OR p_hash IS NULL OR p_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
    RETURN false;
  END IF;
  SELECT * INTO registro FROM public.password_reset_tokens
    WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR registro."usedAt" IS NOT NULL OR registro."expiresAt" <= clock_timestamp() THEN
    RETURN false;
  END IF;
  UPDATE public.usuarios SET "senhaHash" = p_hash, "updatedAt" = clock_timestamp()
    WHERE email = registro.email;
  GET DIAGNOSTICS alterados = ROW_COUNT;
  IF alterados <> 1 THEN RETURN false; END IF;
  UPDATE public.password_reset_tokens SET "usedAt" = clock_timestamp() WHERE id = registro.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.redefinir_senha_por_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redefinir_senha_por_token(TEXT, TEXT) TO app_auth;
