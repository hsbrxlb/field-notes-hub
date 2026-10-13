const fs = require('fs');
const path = require('path');
const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(process.env.PUBLIC_SITE_ROOT) : path.resolve(__dirname, '..');
const library = path.join(root, 'data/product-library');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = read(path.join(library, 'latest-manifest.json'));
if (!manifest.publicOnly || !manifest.version) throw Error('Missing public version');
const productFields = new Set(['id','productId','sku','brand','categoryId','name','url','capturedAt','imageReview','image_facts','document_image_facts','fitment','price','review','warnings','description','highlights','specifications','package','installation','media','variants','policies','image_review','faq','stage','usage_conditions','field_evidence','field_status','conflicts','documents','sourceStatus','recordKey','brandKey','fieldEvidence','volatileFields','missingFields','libraryVersion']);
function noPrivateFields(value) {
  if (Array.isArray(value)) return value.forEach(noPrivateFields);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:raw_snapshot|raw_file|local_path|path|review_sheet|cookie|token|password|secret|api_key|employee|customer|owner_thread_id|approval|reviewer)$/i.test(key)) throw Error(`Private product key ${key}`);
      noPrivateFields(child);
    }
  } else if (typeof value === 'string' && /\/Users\/|file:\/\/|\.html\.gz|TEST-FACT|request_sha256|output_sha256/.test(value)) throw Error('Private source content in public product export');
}
let total = 0;
for (const [brandKey, brand] of Object.entries(manifest.brands)) {
  const index = read(path.join(library, brand.index));
  if (index.brandKey !== brandKey || index.version !== manifest.version || index.products.length !== brand.count) throw Error(`Bad brand index: ${brandKey}`);
  const keys = new Set();
  for (const entry of index.products) {
    if (keys.has(entry.key)) throw Error(`Duplicate record key ${entry.key}`);
    keys.add(entry.key);
    const product = read(path.join(library, entry.json));
    if (Object.keys(product).some(key => !productFields.has(key))) throw Error(`Unknown public product field ${entry.key}`);
    noPrivateFields(product);
    if (product.libraryVersion !== manifest.version) throw Error(`Wrong product version ${entry.key}`);
    if (product.brandKey !== brandKey || product.brand !== index.brand || product.recordKey !== entry.key) throw Error(`Cross-brand facts ${entry.key}`);
    const domain = brandKey === 'cozeware' ? 'www.cozeware.com' : 'www.oedro.com';
    if (new URL(product.url).hostname !== domain || !product.capturedAt || !product.fieldEvidence) throw Error(`Bad provenance ${entry.key}`);
    if (/raw_snapshot|\/Users\/|\.html\.gz|"(?:cookie|token|employee|customer|thread_id)"/.test(JSON.stringify(product))) throw Error(`Private data ${entry.key}`);
    if (!fs.existsSync(path.join(library, entry.markdown))) throw Error(`Missing Markdown ${entry.key}`);
    total++;
  }
  for (const refs of Object.values(index.skuLookup)) {
    if (!refs.length || refs.some(key => !keys.has(key))) throw Error(`Invalid SKU mapping ${brandKey}`);
  }
  const policy = read(path.join(library, index.policyFile));
  if (policy.brand !== index.brand || policy.policies.some(item => !item.url || !item.capturedAt)) throw Error(`Bad policy provenance ${brandKey}`);
  noPrivateFields(policy);
  for (const resource of index.resources || []) {
    const facts = read(path.join(library, resource.json));
    if (facts.brandKey !== brandKey || facts.url !== resource.url || !facts.capturedAt || facts.version !== manifest.version) throw Error(`Wrong resource scope ${resource.key}`);
    noPrivateFields(facts);
  }
}
if (!manifest.brands.oedro || !manifest.brands.cozeware) throw Error('Both brands must exist');
console.log(`Public product facts passed: ${total} records; ${manifest.version}`);
