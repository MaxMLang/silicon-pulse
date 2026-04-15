// ─── Prompt Templates ────────────────────────────────────────────────────────

export function buildBaselinePrompt(questionText: string, options: string[], shuffledOptions: string[]): string {
  const optionList = shuffledOptions.join(' / ')
  return `You are participating in a social science research study examining how AI systems respond to public opinion survey questions.

Answer the following question by selecting ONE option from the list provided, then explain your reasoning in one sentence.

Question: ${questionText}
Options: ${optionList}

Respond in this exact format:
Answer: [your choice]
Reasoning: [one sentence]`
}

export function buildInformedPrompt(
  questionText: string,
  shuffledOptions: string[],
  newsBrief: string
): string {
  const optionList = shuffledOptions.join(' / ')
  return `You are participating in a social science research study examining how AI systems respond to public opinion survey questions.

Before answering, consider the following summary of recent news coverage:

---
${newsBrief}
---

Now answer the following question by selecting ONE option from the list provided, then explain your reasoning in one sentence.

Question: ${questionText}
Options: ${optionList}

Respond in this exact format:
Answer: [your choice]
Reasoning: [one sentence]`
}

export function buildOpenPrioritiesPrompt(newsBrief?: string): string {
  const newsSection = newsBrief
    ? `Before answering, consider the following summary of recent news coverage:\n\n---\n${newsBrief}\n---\n\n`
    : ''

  return `You are participating in a social science research study.

${newsSection}In your view, what is the most important problem facing the United States today? Give a brief answer in one or two sentences.`
}

export function buildThemeClassifierPrompt(rawResponse: string): string {
  return `You are a research assistant classifying open-ended survey responses about the most important problem facing the United States.

Classify the following response into exactly ONE of these categories:
- Economy
- Government/Leadership
- Immigration
- Healthcare
- Crime/Violence
- Education
- Environment/Climate
- National Security
- Race Relations
- Poverty/Inequality
- Other

Response to classify: "${rawResponse}"

Reply with ONLY the category name, nothing else.`
}

export function buildNewsSummaryPrompt(headlines: string[]): string {
  const headlineList = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
  return `You are a news editor creating a concise briefing from recent headlines.

For each headline below, write a 2-3 sentence summary covering what happened, why it matters, and any relevant context. Focus on factual reporting.

Headlines:
${headlineList}

Format your response as numbered summaries matching the headline numbers. Keep the total output under 800 words.`
}
