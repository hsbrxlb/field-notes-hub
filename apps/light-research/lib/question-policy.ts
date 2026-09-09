// Defense in depth for authored and model wording. Semantic scope is also
// constrained by the model contract and server-selected topic and field.
export const questionPolicyViolation = (text: string): string | null => {
  const normalized = text.normalize("NFKC");
  if (/\b(?:e-?mail|phone number|telephone|street address|home address|exact address|full name|passport|social security|credit card|account number|gps coordinates|coordinates)\b|(?:precise|exact).{0,24}(?:location|coordinates)|(?:住址|家庭地址|详细地址|精确地址|具体门牌|电话号码|手机号|邮箱|身份证|银行卡|真实姓名)|(?:direcci[oó]n\s+(?:exacta|postal|de\s+(?:tu\s+)?casa)|n[uú]mero\s+de\s+tel[eé]fono|correo\s+electr[oó]nico|nombre\s+completo|coordenadas\s+exactas)/iu.test(normalized)) return "personal_identifier_request";
  if (/\b(?:wouldn['’]?t|don['’]?t you (?:think|agree)|surely|obviously|is it because|would you say|does that mean)\b|(?:make|makes).{0,40}(?:safer|better)|(?:是不是|难道|你也同意|显然)|(?:会不会|难道).{0,35}(?:更安全|更好|值得)|(?:no\s+(?:crees|ser[ií]a)|verdad\s*\?|m[aá]s\s+segur[oa])/iu.test(normalized)) return "leading_premise";
  if (/\b(?:right choice for everybody|everyone should buy|you should buy|best brand|buy now)\b|你应该买|大家都应该买|deber[ií]as comprar/iu.test(normalized)) return "persuasion";
  return null;
};
