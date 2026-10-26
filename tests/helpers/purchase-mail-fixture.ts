import {createHash} from 'node:crypto';
const amounts:Record<string,string>={plus:'3.99',boost:'2.99',super:'5.99',mega:'8.99',top:'12.99'};
export function purchaseMailFixture(sku='plus',terms='Example purchase terms — synthetic preview only. No purchase or charge was made.\n\nExample seller: Example Company, Example Street 1, Example City.\nContact: billing@example.invalid.\n\nThese are synthetic conditions for layout and byte-preservation tests. Your statutory rights are unaffected.\n'){
 const id='00000000-0035-4000-8000-000000000001',hash=createHash('sha256').update(terms).digest('hex');
 return {id,terms,hash,subject:'ONYX — Purchase confirmation',mail_format:1,text:`ONYX — Purchase confirmation\nOrder: ${id}\nProduct: ${sku}\nTotal: EUR ${amounts[sku]}\n${sku==='plus'?'Monthly subscription; cancel before renewal.':'One-time payment; 14 days from activation; no renewal.'}\nPaid: 2026-10-25 11:39:54.678123+00\nTerms SHA-256: ${hash}\nTerms accepted in Stripe Checkout.\n\n${terms}`};
}
