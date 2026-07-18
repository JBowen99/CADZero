export const config = {
  openrouterModel: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
  port: Number(process.env.PORT ?? "8787"),
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
  openscadPath: process.env.OPENSCAD_PATH ?? "openscad",
  pythonPath: process.env.PYTHON_PATH ?? "",
};
