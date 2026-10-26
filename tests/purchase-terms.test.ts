import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMerchant,purchaseSections} from '../website/purchase-terms.mjs';
import {renderPage} from '../website/render.mjs';

// Synthetic PUBLIC seller fixture; never reads the operator's local details.
const seller=()=>({publishPurchaseTerms:true,legalName:'Example <Seller> & Co',addressLines:['Example Street 1','12345 Example City',''],country:'Example Country',supportEmail:'support@example.invalid',supportPhone:'+49 123 456789'});
test('unapproved or incomplete seller details cannot publish incomplete purchase terms',()=>{
 assert.equal(validateMerchant({...seller(),publishPurchaseTerms:false}),null);
 assert.deepEqual(purchaseSections(null),[]);assert.doesNotMatch(renderPage('guidelines',undefined,null),/id="purchase-terms"|Purchase terms &amp; contact|Purchase terms & contact/);
 for(const patch of [{legalName:''},{addressLines:['only one line']},{supportEmail:'bad@invalid'},{supportPhone:'none'},{country:''},{publishPurchaseTerms:'true'},{secret:'not-an-allowed-field'},{supportEmail:'someone@example.invalid\nInjected: value'}])assert.throws(()=>validateMerchant({...seller(),...patch}));
});
test('email-only seller support omits an absent phone rather than inventing a contact',()=>{
 const merchant=validateMerchant({...seller(),supportPhone:''}),html=renderPage('guidelines',undefined,merchant);
 assert.doesNotMatch(purchaseSections(merchant).map(section=>section[2]).join(''),/telephone:|telephone ,|none<|undefined/);assert.match(html,/support@example.invalid/);
 assert.match(html,/id="cancel-subscription"/);assert.match(html,/id="withdraw-contract"/);
 assert.match(html,/data-commerce-notice="cancel"/);assert.match(html,/data-commerce-notice="withdraw"/);
});
test('approved terms render escaped seller details, exact prices, recurrence and preserved rights',()=>{
 const merchant=validateMerchant(seller()),html=renderPage('guidelines',undefined,merchant);
 assert.match(html,/Example &lt;Seller&gt; &amp; Co/);assert.doesNotMatch(html,/<Seller>/);
 for(const amount of ['€3.99','€2.99','€5.99','€8.99','€12.99'])assert(html.includes(amount));
 assert.match(html,/renews each month/);assert.match(html,/do not renew automatically/);assert.match(html,/14 days/);assert.match(html,/zero or one member/);
 assert.match(html,/There is no blanket/);assert.match(html,/14 days without giving a reason/);assert.match(html,/Model withdrawal form/);assert.match(html,/Mandatory consumer protection/);
 assert.match(html,/id="purchase-terms"/);assert.match(html,/href="\/guidelines\/#purchase-terms"/);
 for(const page of ['home','download','privacy'])assert.match(renderPage(page,undefined,merchant),/href="\/guidelines\/#purchase-terms"/);
});
