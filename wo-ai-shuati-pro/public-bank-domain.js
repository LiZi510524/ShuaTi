export function isProfileComplete(profile) {
  return Boolean(String(profile?.username || "").trim() && String(profile?.display_name || "").trim());
}

export function getPublishBlocker({ cloudConfigured, cloudUser, cloudProfile }) {
  if (!cloudConfigured) return "请先配置 Supabase";
  if (!cloudUser) return "请先登录";
  if (!isProfileComplete(cloudProfile)) return "请先设置公开用户名和昵称";
  return "";
}

export function findSavedPublicBank(banks, cloudId) {
  return banks.find((bank) => bank.cloudId === cloudId) || null;
}

export function mapPublicBankToLocal({
  payload,
  localBankId,
  now,
  createQuestionId,
  buildBankName,
  countQuestionTypes,
}) {
  const localQuestions = payload.questions.map((question, index) => ({
    id: createQuestionId(),
    cloudQuestionId: question.id,
    bankId: localBankId,
    order: question.order_no || index + 1,
    stem: question.stem,
    answer: question.answer,
    analysis: question.analysis || "",
    type: question.type,
    options: question.options || [],
    createdAt: now,
  }));
  const localCourse = String(payload.bank.course || payload.bank.name || "公开题库").trim();
  const localChapter = String(payload.bank.chapter || "").trim();
  const localBank = {
    id: localBankId,
    cloudId: payload.bank.id,
    sourceOwnerUsername: payload.bank.owner_username,
    name: buildBankName(localCourse, localChapter, payload.bank.name),
    course: localCourse,
    chapter: localChapter,
    tags: payload.bank.tags || [],
    questionCount: localQuestions.length,
    counts: payload.bank.counts || countQuestionTypes(localQuestions),
    visibility: "saved-public",
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: "",
  };
  return { localBank, localQuestions };
}
