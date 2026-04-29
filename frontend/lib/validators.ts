/**
 * Validadores reutilizables para el formulario de scraping.
 */

export function isValidUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface FormErrors {
  urls?: string;
  prompt?: string;
}

export interface UrlLineError {
  line: number;
  url: string;
  message: string;
}

export interface UrlValidationResult {
  valid: string[];
  lineErrors: UrlLineError[];
  generalError?: string;
}

/** Valida un bloque de texto con URLs una por línea. */
export function validateUrls(raw: string): UrlValidationResult {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      valid: [],
      lineErrors: [],
      generalError: "Ingresá al menos una URL.",
    };
  }

  if (lines.length > 50) {
    return {
      valid: [],
      lineErrors: [],
      generalError: `Demasiadas URLs: ingresaste ${lines.length}, el máximo es 50.`,
    };
  }

  const valid: string[] = [];
  const lineErrors: UrlLineError[] = [];

  // Numeramos considerando líneas vacías omitidas
  let lineNumber = 0;
  raw.split("\n").forEach((rawLine) => {
    lineNumber++;
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    if (isValidUrl(trimmed)) {
      valid.push(trimmed);
    } else {
      lineErrors.push({
        line: lineNumber,
        url: trimmed,
        message: `URL inválida en la línea ${lineNumber}: ${trimmed}`,
      });
    }
  });

  return { valid, lineErrors };
}

/** Valida el formulario completo y devuelve errores de nivel form. */
export function validateForm(urlsRaw: string, prompt: string): FormErrors {
  const errors: FormErrors = {};

  const { valid, lineErrors, generalError } = validateUrls(urlsRaw);

  if (generalError) {
    errors.urls = generalError;
  } else if (lineErrors.length > 0) {
    // El error general se omite — ScrapeForm muestra los errores por línea
  } else if (valid.length === 0) {
    errors.urls = "Ingresá al menos una URL válida.";
  }

  if (!prompt.trim()) {
    errors.prompt = "Describí qué información querés extraer.";
  } else if (prompt.trim().length < 5) {
    errors.prompt = "La instrucción es demasiado corta — sé más específico.";
  }

  return errors;
}
