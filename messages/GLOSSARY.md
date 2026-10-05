# Vietnamese glossary

The Vietnamese interface (messages/vi/*.json) uses these terms. Drafted from VAS / Ministry of Finance wording (TT133) and current tax law, reviewed by a CPA-style check, and approved by the owner on 2026-10-05.

- **Vietnamese** is the full term; **Short** is the form for buttons, column headers and badges.
- Use the same term for the same concept everywhere. When a new string needs a term that isn't here, follow the nearest entry and add it here.
- Key choices: an entry is a **bút toán** (never "chứng từ", which means evidence documents); posting is **ghi sổ** ("Đã ghi sổ"); the owner who pays or holds money for the company is **chủ DN**; linking a payment to an invoice is **liên kết** (amounts allocated stay **đối trừ**); bank lines are **khớp**; the ledger is the **Sổ thu chi**; the app is **Quản lý thu chi kế toán**.

## Navigation

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Dashboard | Tổng quan | Tổng quan | Both drafts agree. It is the usual name for an overview page (MISA AMIS uses 'Tổng quan'). It replaces 'Bảng điều khiển' from the old vi.json. |
| Ledger | Sổ thu chi | Sổ thu chi | TT133 keeps Sổ quỹ tiền mặt (S07-DNN) and Sổ tiền gửi ngân hàng (S08-DNN) as separate books, and this app combines them into one cash book. 'Sổ thu chi' is the common name for that. Avoid 'Sổ cái', which is the general ledger kept per account. Usage: 'Mở trong sổ thu chi'; handover sheet 'Sổ thu chi'. |
| Accounts | Tài khoản tiền | Tài khoản | Groups TK 111, 112 and 1281 (TT133). The page title uses the full form so it is not read as a chart-of-accounts code or a login account. The sidebar item can be 'Tài khoản'. |
| Bank (nav) | Ngân hàng | Ngân hàng | Sidebar item only. The page itself is 'Đối chiếu ngân hàng'. |
| Invoices (nav) / Invoices & Bills (page title) | Hóa đơn / Hóa đơn bán ra & mua vào | Hóa đơn | TT80/2021 uses 'hóa đơn … bán ra / mua vào'. Subtitle: 'Khách hàng còn nợ công ty và công ty còn nợ nhà cung cấp'. Handover sheet: 'Hóa đơn'. |
| Projects | Dự án | Dự án | Common usage; both drafts agree. |
| Clients & Vendors | Khách hàng & nhà cung cấp | Khách hàng & NCC | TK 131 'khách hàng' and TK 331 'người bán'. 'Nhà cung cấp' is the natural word in software (MISA). |
| Costs (nav) / Cost register (page title) | Chi phí / Bảng kê chi phí | Chi phí | The sidebar shows 'Chi phí'. For the page title, see the 'Cost register' entry. |
| Reports | Báo cáo | Báo cáo | Common usage; both drafts agree. |
| Handover | Bàn giao kế toán | Bàn giao | Firms commonly 'bàn giao chứng từ kế toán' to an outsourced accountant. Page h1: 'Bàn giao cho kế toán'. |
| Settings / Global Settings | Cài đặt / Cài đặt chung | Cài đặt | Common software usage. 'Cài đặt chung' keeps the same word as the page name, where Draft B had 'Thiết lập chung'. |
| Profile / Your profile | Hồ sơ cá nhân / Hồ sơ của bạn | Hồ sơ | Common software usage; both drafts agree. |
| Accounting Entry Tracker (app title) | Quản lý thu chi kế toán | Quản lý thu chi | **Owner's choice.** Follows the choice of 'bút toán' for an entry. This is a product-naming decision for the owner. |

## Books & entries

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Entry / Transaction / Ledger entry (all uses) | Bút toán | Bút toán | One word for both 'entry' and 'transaction'. 'Bút toán' keeps the book side apart from the bank side ('dòng sao kê'). It also matches the agreed 'bút toán đảo' and 'bút toán điều chỉnh' and the duyệt / khóa sổ workflow. Usage: 'Lưu bút toán', 'Đã lưu bút toán', 'Bút toán gần đây', '12 bút toán', 'bút toán nháp', 'Bút toán trong tháng'. Draft B argued for 'giao dịch' because the rows are single-sided cash records, not Nợ/Có pairs. If the owner picks it, use it everywhere and keep 'bút toán đảo' only for reversals. Never use 'chứng từ', which is reserved for evidence. |
| New Entry | Thêm bút toán / Bút toán mới (page title) | Thêm bút toán | Follows the 'Entry' decision. Not 'Thêm chứng từ'. |
| Edit Entry / Posted Entry | Sửa bút toán / Bút toán đã ghi sổ | Sửa / Đã ghi sổ | **Aligned with the owner's choices.** Follows the 'Entry' and 'Posted' decisions. |
| Movement | Bút toán chuyển tiền, vốn, vay | Bút toán | A movement is a kind of entry, so it uses the same word. The Accounts page already shows these are not thu/chi. Usage: 'Sửa bút toán', 'Đã ghi nhận / đã đảo / đã xóa bút toán', 'N bút toán cần phân loại'. Avoid 'biến động', which reads as a change in balance. |
| Date (entry / bank line) | Ngày giao dịch | Ngày | The date the money moved, used for both entries and statement lines. Kept apart from 'Ngày hạch toán', which is the bank's booking date. Both drafts agree. |
| Type (entry type) | Loại nghiệp vụ | Loại | Luật Kế toán uses 'nghiệp vụ kinh tế, tài chính'. Column headers and the Settings category form use the short form 'Loại'. |
| Category / Uncategorized / No category / Income Categories / Expense Categories | Khoản mục / Chưa có khoản mục / Không có khoản mục / Khoản mục doanh thu / Khoản mục chi phí | Khoản mục / Chưa có khoản mục / Khoản mục thu / Khoản mục chi | 'Khoản mục chi phí' is standard reporting vocabulary (MISA). 'Chưa có khoản mục' is kept apart from 'chưa phân loại', which belongs to unclassified movements. Reports: 'Doanh thu theo khoản mục' and 'Chi phí theo khoản mục'. |
| Description | Diễn giải (entries, exports) / Mô tả (projects, settings) | Diễn giải | 'Diễn giải' is the column name on TT133/TT99 voucher and book forms. Free-text descriptions of a project or setting use 'Mô tả' (e.g. 'Mô tả (phạm vi, sản phẩm bàn giao, điều khoản…)'). |
| Amount / Amount (VND) | Số tiền (nguyên tệ) / Số tiền quy đổi (VND) | Số tiền / Quy đổi VND | TT133 forms use 'nguyên tệ' for the amount in its original currency. 'Quy đổi' is conversion at the actual transaction rate. Draft B left '(nguyên tệ)' off the label. In VND-only tables, plain 'Số tiền' is enough. |
| Account (money account: column, field, picker) | Tài khoản tiền | Tài khoản | TK 111, 112 and 1281. 'Choose account' becomes 'Chọn tài khoản'. Write the full form wherever it could be confused with a chart-of-accounts code or a login account. |
| Received into / Paid from | Thu vào tài khoản / Chi từ tài khoản | Thu vào / Chi từ | Common usage; both drafts agree. |
| Project (Optional) / No project | Dự án (không bắt buộc) / Không thuộc dự án | Dự án / Không thuộc dự án | Common usage. 'Không thuộc dự án' is also used in the project pickers. |
| Vendor (Optional) / No vendor | Nhà cung cấp (không bắt buộc) / Không có nhà cung cấp | NCC / Không có | TK 331 'người bán'. 'Nhà cung cấp' is the natural word in software. |
| Entered by / Entry ID | Người lập / Mã bút toán | Người lập / Mã | 'Người lập' is the signature line on TT133/TT99 vouchers and on MISA forms. |
| History / Change history | Lịch sử thay đổi | Lịch sử | Actions: Tạo, Sửa, Duyệt, Khóa sổ, Đảo, Xóa, Khớp với dòng sao kê, Bỏ khớp dòng sao kê, Đối trừ, Bỏ đối trừ. Handover sheet columns: Thời điểm (UTC), Người thực hiện, Thao tác, Trường, Giá trị cũ, Giá trị mới, Lý do. |
| Reason / Reason for the change | Lý do / Lý do thay đổi | Lý do | Common usage; both drafts agree. |
| Ledger tabs: All / Drafts / Documents to find / Tax review pending | Tất cả / Nháp / Thiếu chứng từ / Chờ rà soát thuế | Tất cả / Nháp / Thiếu chứng từ / Chờ rà soát thuế | Luật Kế toán 2015 Đ.3 'chứng từ kế toán'. Both drafts agree. |
| Correction / Correction of | Bút toán điều chỉnh / Điều chỉnh cho bút toán | Điều chỉnh | Luật Kế toán 2015 rules on correcting the books ('ghi điều chỉnh'). The handover open-question area is called 'Điều chỉnh'. |

## Entry types

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Income (entry type) | Khoản thu | Thu | Follows the cash-book convention of phiếu thu / phiếu chi (TT133). The type toggle reads 'Thu \| Chi'. P&L totals and cards still say 'Doanh thu' (VAS 14; TK 511/711). Draft A used 'Doanh thu' as the type label, which is also correct. |
| Expense (entry type) | Khoản chi | Chi | Phiếu chi (TT133). P&L totals say 'Chi phí' (VAS 01; TK 642/811). |
| Transfer in / Transfer out | Chuyển tiền nội bộ vào / Chuyển tiền nội bộ ra | Chuyển vào / Chuyển ra | TK 113 'Tiền đang chuyển'; MISA's function is called 'Chuyển tiền nội bộ'. A transfer is never income or expense, and deleting one side deletes both. |
| Capital contribution | Nhận vốn góp của chủ sở hữu | Nhận vốn góp | TK 4111 'Vốn góp của chủ sở hữu'. The B03 cash-flow statement (VAS 24) has the line 'nhận vốn góp của chủ sở hữu'. This is financing, not doanh thu. |
| Loan received | Nhận tiền vay | Nhận tiền vay | TK 341, sub-account 3411 'Các khoản đi vay'. B03 line 'Tiền thu từ đi vay'. |
| Loan repayment | Trả nợ gốc vay | Trả gốc vay | B03 line 'Tiền trả nợ gốc vay' (VAS 24). It covers principal only; interest would be 'chi phí lãi vay'. |
| Unclassified in / Unclassified out | Tiền vào chưa phân loại / Tiền ra chưa phân loại | Vào – chưa phân loại / Ra – chưa phân loại | Follows Draft B. 'Thu/Chi chưa phân loại' would read as unclassified income or expense, but these items are waiting to become capital, a loan or a repayment. The wording matches the statement's 'Tiền vào / Tiền ra'. An accountant would park them in TK 1388/3388 'chờ xử lý'. |
| Classify / need classifying | Phân loại / cần phân loại | Phân loại | Common usage. Example: 'N bút toán cần phân loại'. |

## Statuses

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Draft | Nháp (chờ duyệt) | Nháp | Common usage for vouchers awaiting approval (lập → kiểm tra → duyệt). Not counted in balances or reports. Both drafts agree. |
| Reviewed | Đã duyệt | Đã duyệt | Common usage for checking and signing off vouchers ('ký duyệt chứng từ'). Both drafts agree. |
| Posted | Đã ghi sổ | Đã ghi sổ | **Owner's choice.** POSTED is a period-close lock, not the first recording. Luật Kế toán 88/2015 Đ.26 ('Mở sổ, ghi sổ, khóa sổ kế toán') separates ghi sổ (recording) from khóa sổ (closing). In MISA, 'ghi sổ' is the first recording and can be undone with 'bỏ ghi', which this app forbids. Draft B prefers 'Đã ghi sổ' because MISA users know it as the posted state. |
| Post / Post (verb) / Post reviewed entries through | Ghi sổ / Ghi sổ đến ngày | Ghi sổ / Ghi sổ đến ngày | **Owner's choice.** Same decision as 'Posted'. Month-end closing up to a date is 'khóa sổ' (Luật Kế toán Đ.26). Handover: 'khóa sổ tháng tại Sổ thu chi'; 'Đã duyệt nhưng chưa khóa sổ'. |
| Locked (posted entry) | Đã khóa (đã ghi sổ) | Đã khóa | **Aligned with the owner's choices.** A posted entry is locked against edits: show it as “Đã ghi sổ — đã khóa” (tooltip/button “Mở (đã ghi sổ — đã khóa)”). Posting itself is always “ghi sổ”, never “khóa sổ”. |
| Approve (mark reviewed) / Review (verb) | Duyệt | Duyệt | Common usage. History: 'Đã duyệt'. Toast: 'Đã duyệt bút toán'. 'until the owner reviews it' becomes 'cho đến khi chủ doanh nghiệp duyệt'. |
| Waiting for review / Not reviewed / Not posted | Chờ duyệt / Chưa duyệt / Chưa ghi sổ | Chờ duyệt / Chưa duyệt / Chưa ghi sổ | **Aligned with the owner's choices.** Parallel with Nháp / Đã duyệt / Đã khóa sổ. |
| Draft — counts once reviewed | Nháp — chỉ được tính khi đã duyệt | Nháp — chờ duyệt | A draft payment does not settle the invoice until it is reviewed. |
| Reverse / Reverse a posted entry / Reverse and enter the correction | Đảo bút toán / Đảo bút toán đã ghi sổ / Đảo và nhập bút toán điều chỉnh | Đảo | **Aligned with the owner's choices.** Luật Kế toán 2015 provisions on correcting books by the 'ghi số âm' method (cited by both drafts as Đ.27). 'Bút toán đảo' is how accountants say it. Avoid 'ghi âm', which also means audio recording, and 'Bỏ ghi', which in MISA means un-posting. |
| Reversal / Reversed | Bút toán đảo / Đã đảo | Đảo / Đã đảo | Description prefix: 'Đảo:'. Export suffixes: '(bút toán đảo)' and '(đã đảo)'. A reversed entry cannot be linked to an invoice; link its correction instead. |
| Status (column) | Trạng thái | Trạng thái | Common usage; both drafts agree. |

## Evidence & tax review

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Evidence / no evidence attached | Chứng từ / chưa đính kèm chứng từ | Chứng từ | Luật Kế toán 2015 Đ.3: 'chứng từ kế toán' are the documents behind an entry. Reserved for supporting documents and never used for the entry itself. Ledger column 'Evidence' becomes 'Chứng từ'. |
| Attachments (Receipts / Invoices) / Evidence files | Chứng từ đính kèm (hóa đơn, biên lai) / Tệp chứng từ | Đính kèm | Actions: 'Tải tệp lên', 'Thêm tệp', 'Xóa tệp' ('Remove receipt' removes a file). The export column 'Attachments' becomes 'Tệp đính kèm'; the handover card becomes 'Tệp chứng từ'; the ZIP folder is 'chung-tu'. |
| Receipt | Biên lai | Biên lai | Proof of purchase that is not a VAT invoice. NĐ 123/2020 formally uses 'biên lai' for fee and charge receipts, but 'chỉ có biên lai' is well understood. Where the UI means any evidence file, write 'chứng từ' or 'tệp'. |
| E-invoice (original e-invoice) | Hóa đơn điện tử (tệp gốc) | HĐĐT gốc | NĐ 123/2020, amended by NĐ 70/2025. The original is the XML file. Upload hint: 'ZIP chứa tệp XML gốc của HĐĐT'. |
| Evidence & tax review (section) | Chứng từ và rà soát thuế | Chứng từ & thuế | 'Rà soát' is the everyday word for checking tax treatment. Avoid 'soát xét', which suggests an auditor's review engagement. |
| Tax review | Rà soát thuế | Rà soát thuế | Common practice; both drafts agree. Used for the Reports card and the handover question area. |
| Document (document status) | Tình trạng chứng từ | Chứng từ | The same status set is used in the ledger review, the cost register, exports and handover sheets. The column header can be 'Chứng từ'. |
| Not checked (document status) | Chưa kiểm tra | Chưa kiểm tra | Common usage; both drafts agree. |
| Invoice on file | Đã có hóa đơn | Có hóa đơn | Luật Thuế GTGT 48/2024: a hóa đơn GTGT is required to deduct input VAT. |
| Receipt only | Chỉ có biên lai | Chỉ có biên lai | Means no hóa đơn GTGT is held. Both drafts agree. |
| Payment proof only | Chỉ có chứng từ thanh toán | Chỉ có CT thanh toán | The tax laws use 'chứng từ thanh toán không dùng tiền mặt'. Examples: ủy nhiệm chi, giấy báo Nợ. |
| Invoice missing | Thiếu hóa đơn | Thiếu hóa đơn | Common usage. Shown in red. |
| Documents still to find / Missing documents | Chứng từ cần bổ sung / Thiếu chứng từ | Thiếu chứng từ | Common phrasing ('bổ sung chứng từ'). Handover sheet name: 'Thiếu chứng từ'. |
| Business purpose | Mục đích phục vụ sản xuất, kinh doanh | Mục đích KD | Luật Thuế TNDN 67/2025/QH15 Đ.9: a deductible expense must relate to the business's sản xuất, kinh doanh. |
| Not confirmed / Business use confirmed / Personal — not company | Chưa xác nhận / Đã xác nhận phục vụ SXKD / Chi cá nhân — không phải của công ty | Chưa xác nhận / Phục vụ SXKD / Chi cá nhân | Luật TNDN 67/2025 Đ.9. Accountants know the abbreviation SXKD. Draft B used the plainer 'phục vụ KD'. |
| CIT deductibility / CIT | Tình trạng được trừ (thuế TNDN) / Thuế TNDN; Reports card: Chi phí trong tháng theo tình trạng được trừ khi tính thuế TNDN | TNDN | Luật Thuế TNDN 67/2025 Đ.9 'các khoản chi được trừ'. Ledger badge: 'TNDN:'. Reports: 'Chi phí được trừ khi tính thuế TNDN trong tháng'. — corrected in review: The English is a field asking whether the expense is deductible. Its values are Deductible, Not deductible and Pending review. The Vietnamese 'Chi phí được trừ khi tính thuế TNDN' asserts that the item IS a deductible expense, so the form reads as a contradiction: 'Chi phí được trừ khi tính thuế TNDN: Không được trừ'. On Reports, 'CIT deductibility of this month's expenses' becomes 'Chi phí được trừ … trong tháng'. That changes the meaning: the card breaks down all three statuses, but the Vietnamese says it lists only the deductible costs. |
| Deductible / Not deductible | Được trừ / Không được trừ | Được trừ / Không được trừ | Luật TNDN 67/2025 Đ.9 'khoản chi được trừ / không được trừ'. Both drafts agree. |
| Pending review (CIT / VAT status) | Chờ rà soát | Chờ rà soát | The default status before any tax decision is recorded. It is a different status from the cost item's 'Chờ hạch toán'. |
| Input VAT | Thuế GTGT đầu vào | GTGT đầu vào | Luật Thuế GTGT 48/2024/QH15; TK 133 'Thuế GTGT được khấu trừ'. Ledger badge: 'GTGT:'. |
| Claimable / Not claimable / No VAT on document | Được khấu trừ / Không được khấu trừ / Chứng từ không có thuế GTGT | Được khấu trừ / Không khấu trừ / Không có GTGT | Luật Thuế GTGT 48/2024: a deduction needs a hóa đơn GTGT, plus non-cash payment when the amount is 5 million VND or more. 'Claimable (invoice on file)' becomes 'Được khấu trừ (đã có hóa đơn)'. Avoid 'không chịu thuế', which is a separate legal category. |
| VAT on the invoice / VAT amount | Tiền thuế GTGT trên hóa đơn / Tiền thuế GTGT | Tiền thuế GTGT | NĐ 123/2020 Đ.10; the e-invoice and MISA field is 'Tiền thuế GTGT'. |
| Expenses with VAT not yet reviewed | Khoản chi chưa rà soát thuế GTGT | Chưa rà soát GTGT | Common usage; both drafts agree. |
| Review note(s) / Evidence notes | Ghi chú rà soát / Ghi chú chứng từ | Ghi chú rà soát | A review note is required when deducting without an invoice or receipt. 'Ghi chú chứng từ' is the cost-register note on the receipt itself. The handover 'Note' area becomes 'Ghi chú'. |
| Accountant | Kế toán dịch vụ | Kế toán | Luật Kế toán 2015 (dịch vụ kế toán). If the external party is a firm, write 'đơn vị dịch vụ kế toán'. |
| Invoice # / Invoice number / Invoice/bill number / Invoice / receipt number | Số hóa đơn / Số hóa đơn, chứng từ (cost register) | Số HĐ / Số HĐ/CT | NĐ 123/2020 Đ.10 'số hóa đơn'. In the cost register this number is also used to detect duplicates. |

## Invoices & payments

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Invoice (receivable) / Invoice (AR) | Hóa đơn bán ra | HĐ bán ra | TT80/2021 uses 'hóa đơn … bán ra'; accountants also say 'hóa đơn đầu ra'. Stating the side solves the problem that both an invoice and a bill are 'hóa đơn' in Vietnamese. |
| Bill (payable) / Bill (AP) | Hóa đơn mua vào | HĐ mua vào | TT80/2021 'hóa đơn … mua vào' ('hóa đơn đầu vào'). Symmetric with 'Hóa đơn bán ra'. |
| Receivable — a client owes me | Phải thu — khách hàng nợ công ty | Phải thu | TK 131 'Phải thu của khách hàng'. 'Công ty' replaces the awkward 'tôi'. |
| Payable — I owe a vendor | Phải trả — công ty nợ nhà cung cấp | Phải trả | TK 331 'Phải trả cho người bán'. Symmetric with the receivable toggle. |
| Direction: Receivable (AR) / Payable (AP) | Loại công nợ: Phải thu / Phải trả | Phải thu / Phải trả | TK 131 and TK 331. The export column 'Direction' becomes 'Loại công nợ'. |
| Owed to you (AR) | Phải thu khách hàng | Phải thu | TK 131; MISA 'công nợ phải thu'. The overdue part reads 'trong đó quá hạn'. |
| You owe (AP) | Phải trả nhà cung cấp | Phải trả | TK 331 'Phải trả cho người bán'. 'Nhà cung cấp' keeps the pair symmetric with 'khách hàng'. |
| Open AR (owed to you) / Open AP (you owe) | Còn phải thu / Còn phải trả | Còn phải thu / Còn phải trả | TK 131 and TK 331. Shown per currency at the foot of the export. |
| Open (invoice status OPEN) | Chưa thanh toán | Chưa TT | One of the parallel statuses Chưa thanh toán / Thanh toán một phần / Đã thanh toán / Đã hủy. Exports should use these labels instead of the raw codes OPEN, PARTIAL, PAID and VOID. |
| Part paid (PARTIAL) | Thanh toán một phần | TT một phần | Common usage; both drafts agree. |
| Paid (PAID) | Đã thanh toán | Đã TT | Common usage; both drafts agree. |
| Void / Invoice voided / Bill voided (VOID) | Hủy ghi nhận / Đã hủy ghi nhận hóa đơn bán ra / Đã hủy ghi nhận hóa đơn mua vào (status: Đã hủy ghi nhận) | Hủy ghi nhận / Đã hủy ghi nhận | The action is 'Hủy' and the status is 'Đã hủy'. This voids the record in the app only. The tooltip should say it does not cancel the e-invoice with the tax authority, which is a separate procedure under NĐ 123/2020. — corrected in review: 'Hủy hóa đơn' is a defined legal act: NĐ 123/2020 Điều 3 defines it as making an invoice 'không có giá trị sử dụng', and an e-invoice already sent to the buyer may not be cancelled at all, only adjusted or replaced. A toast reading 'Đã hủy hóa đơn bán ra' tells an accountant the e-invoice was cancelled with the tax authority, when the app only stopped tracking its own record. 'Đã hủy hóa đơn mua vào' is worse, because a buyer can never cancel a supplier's invoice. A tooltip does not fix a toast or a status badge, so the wording itself has to say this is the app's record. |
| Overdue / Nothing overdue | Quá hạn / Không có khoản quá hạn | Quá hạn | MISA 'nợ quá hạn'. Counted from the day after the due date, in Vietnam time. |
| Unpaid (badge, not yet overdue) / {n} unpaid | Chưa thanh toán (trong hạn) / {n} chưa thanh toán | Trong hạn | Both drafts suggest 'Trong hạn' for the badge next to 'Quá hạn', because it reads more clearly. The count on project rows uses 'chưa thanh toán'. |
| Outstanding (unpaid) / Still open | Số còn phải thanh toán / Còn lại | Còn lại | Common usage ('còn phải thu / còn phải trả'). Shown per currency. |
| Open only / All (filter) | Chỉ khoản còn nợ / Tất cả | Còn nợ / Tất cả | 'Còn nợ' works for both receivables and payables. 'Tất toán' is kept for loans and deposits. |
| New invoice / bill | Thêm hóa đơn | Thêm hóa đơn | Common usage; both drafts agree. |
| Issue date | Ngày lập hóa đơn | Ngày HĐ | NĐ 123/2020 Đ.9–10 'ngày lập hóa đơn'. People also say 'ngày hóa đơn'. |
| Due date / due {date} | Hạn thanh toán / đến hạn {date} | Hạn TT | MISA 'hạn thanh toán'. The export 'Due Date' column becomes 'Hạn thanh toán'. |
| Amount (gross) / Gross | Tổng tiền thanh toán (gồm thuế) | Tổng tiền | NĐ 123/2020 Đ.10 'tổng tiền thanh toán đã có thuế GTGT'. Settlement is measured against this amount. |
| Party | Đối tượng công nợ | Đối tượng | TK 131 and 331 are kept 'theo từng đối tượng'; MISA uses 'Đối tượng'. |
| Record payment / Payment recorded | Ghi nhận thanh toán / Đã ghi nhận thanh toán | Ghi nhận thanh toán | Common usage; both drafts agree. |
| Payment received / Vendor payment (auto descriptions) | Thu tiền khách hàng / Trả tiền nhà cung cấp | Thu tiền KH / Trả tiền NCC | MISA function names and the standard 'diễn giải' text on phiếu thu / phiếu chi. |
| Payment date / paid {date} / Paid date | Ngày thanh toán / đã thanh toán ngày {date} / Ngày thanh toán đủ | Ngày TT / Ngày TT đủ | 'Ngày thanh toán đủ' is the date the invoice became fully paid. 'Tất toán' is kept for loans and deposits. |
| received / paid (amount) / Received (column) | Đã thu / Đã trả (UI split by direction); Đã thanh toán (shared export/handover column and the invoiceDifference detail) | Đã thu / Đã trả / Đã thanh toán | Symmetric with Phải thu / Phải trả. — corrected in review: The 'Received' column in the Invoices & Bills export and in the handover Invoices sheet holds both receivable and payable rows (export route.ts sets c.received = s.received for every invoice, whichever the direction). Labelling that shared column 'Đã thu' is wrong for every bill (AP) row, where the company paid money out. The handover open-question detail 'received {received}' is also used for both directions. 'Đã thu / Đã trả' is correct only where the UI is already split by direction. |
| Payment (allocation kind) | Thanh toán | Thanh toán | Common usage; both drafts agree. |
| Evidenced fee / Fee (fee →) | Phí có chứng từ / Phí (phí →) | Phí có CT / Phí | Allocation kind FEE. It is allowed only when the expense entry has chứng từ attached. |
| Bank advice | Giấy báo Nợ / Giấy báo Có của ngân hàng | Giấy báo NH | The TK 112 guidance (TT133/TT99) bases entries on 'giấy báo Có, báo Nợ hoặc bảng sao kê'. |
| Link a ledger entry / Link | Liên kết bút toán / Liên kết | Liên kết | **Owner's choice.** Linking an entry to an invoice is a payment allocation. 'Đối trừ chứng từ' is the MISA term for applying payments to invoices. Draft A wrote 'Liên kết' here, which this glossary keeps for the cost-register receipt-to-expense link. |
| Allocate / left to allocate / free | Đối trừ / còn phải đối trừ / chưa đối trừ | Đối trừ | The same operation as Link (MISA 'Đối trừ chứng từ'). Accountants read 'phân bổ' as cost allocation (e.g. TK 242). |
| Linked entries (Show / Hide N linked entries) | Bút toán đã liên kết (Hiện / Ẩn N bút toán đã liên kết) | Đã liên kết | **Aligned with the owner's choices.** Follows the 'đối trừ' choice. |
| Unlink / Entry unlinked | Bỏ liên kết / Đã bỏ liên kết bút toán | Bỏ liên kết | **Aligned with the owner's choices.** MISA uses 'Bỏ đối trừ'. The ledger entry itself stays. |
| not matched (to an invoice) | Chưa liên kết hóa đơn | Chưa liên kết | **Aligned with the owner's choices.** Badge on income entries. Kept apart from bank 'khớp'. Both drafts agree. |
| Invoice / bill badge (payment allocation link) | Liên kết HĐ bán ra / HĐ mua vào | HĐ bán ra / HĐ mua vào | **Aligned with the owner's choices.** Uses the same allocation word and the same invoice and bill names as above. |
| Settles (column) | Đối trừ cho | Đối trừ cho | Covers both payments and fees, so it uses the allocation word. |
| Settle / settled / Nothing left to settle | Thanh toán hết / Đã thanh toán đủ / Không còn số phải thanh toán | Đã thanh toán đủ | In everyday use 'tất toán' is for loans, deposits and contracts. For invoices, 'thanh toán đủ' is more natural. |
| Unmatched difference | Chênh lệch chưa giải trình | Chênh lệch | Accountants use 'giải trình chênh lệch'. The difference is never assumed to be a bank fee. |
| Overpaid by | Thanh toán thừa | Thừa | Common usage. Example: 'Thừa {amount}'. |
| Shortfall | Thanh toán thiếu | Thiếu | Parallel with 'Thanh toán thừa'. It stays visible as a chênh lệch chưa giải trình. |
| Coming Payments | Các khoản sắp thu, sắp trả | Sắp thu – sắp trả | The card lists every open invoice and bill, not only those near their due date, so 'sắp đến hạn' would be inaccurate. |
| Coming in — you receive | Sắp thu — khách hàng còn nợ | Sắp thu | Outstanding receivables (TK 131). |
| Going out — you pay | Sắp trả — công ty còn nợ nhà cung cấp | Sắp trả | Outstanding payables (TK 331). Uses the thu/trả pair to match Phải thu / Phải trả. |

## Bank

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Bank reconciliation | Đối chiếu ngân hàng | Đối chiếu ngân hàng | MISA feature name. The TK 112 guidance asks firms to 'đối chiếu, xác minh' any difference with the bank. Handover sheet: 'Đối chiếu ngân hàng'. |
| Bank statement / Statement / statement imported | Sao kê ngân hàng / Sao kê / đã nhập sao kê | Sao kê | The TK 112 guidance mentions 'bảng sao kê của ngân hàng'. Practitioners also say 'sổ phụ ngân hàng'. |
| Import statement / Import a bank statement / Read statement | Nhập sao kê / Nhập sao kê ngân hàng / Đọc sao kê | Nhập sao kê | 'Import N new lines' becomes 'Nhập N dòng mới'. 'Nothing new to import' becomes 'Không có dòng mới để nhập'. |
| Bank line / statement line | Dòng sao kê | Dòng sao kê | Common usage. 'From bank line' becomes 'Từ dòng sao kê'. |
| Money in / Money out (Credit / Debit) | Tiền vào (Ghi Có) / Tiền ra (Ghi Nợ) | Tiền vào / Tiền ra | The statement columns are written from the bank's side: Có means money into the account. In the company's own books, money in is Nợ TK 112. Keep 'Tiền vào / Tiền ra' as the main label so readers don't confuse the two. |
| Posting date (bank) | Ngày hạch toán của ngân hàng | Ngày hạch toán NH | Banking term. The 'NH' suffix keeps it apart from the company's own recording. 'posted …' becomes 'hạch toán ngày …'. If MB's column is the value date, use 'Ngày hiệu lực'. |
| Reference / Bank reference | Số tham chiếu / Số tham chiếu ngân hàng | Số tham chiếu | Standard on bank statements; both drafts agree. |
| Counterparty | Đối tác giao dịch | Đối tác | The payer or beneficiary. MB statements label the other side as 'đối ứng'. |
| Details / Bank details | Nội dung giao dịch | Nội dung | Bank statement column 'Nội dung giao dịch'. |
| Statement period | Kỳ sao kê | Kỳ sao kê | Common usage. 'statement to {date}' becomes 'sao kê đến ngày {date}'. |
| Matched / Part matched / Not in ledger | Đã khớp / Khớp một phần / Chưa có trên sổ | Đã khớp / Khớp 1 phần / Chưa có trên sổ | MISA AVA uses 'đã khớp / chưa khớp'. 'Trên sổ' echoes the TK 112 wording 'số liệu trên sổ kế toán'. |
| Match / Match to ledger entries | Khớp / Khớp với bút toán trên sổ | Khớp | 'Khớp' is used only for bank lines, 'đối chiếu' for the whole reconciliation, and 'đối trừ' for invoices. Usage: 'Khớp N bút toán', 'Đã khớp dòng sao kê'. |
| Unmatch | Bỏ khớp | Bỏ khớp | Common usage. 'Entry unmatched' becomes 'Đã bỏ khớp bút toán'. |
| Suggested | Gợi ý | Gợi ý | Common usage; both drafts agree. |
| Bank tabs: To reconcile / All lines / Imports | Cần đối chiếu / Tất cả các dòng / Các lần nhập | Cần đối chiếu / Tất cả / Lần nhập | Common usage; both drafts agree. |
| In the app / App balance at month end | Theo sổ / Số dư theo sổ cuối tháng | Theo sổ / Số dư theo sổ | The standard reconciliation idiom compares 'số dư theo sổ' with 'số dư theo sao kê'. |
| Difference / Agrees / DIFFERS | Chênh lệch / Khớp ✓ / CÓ CHÊNH LỆCH | Chênh lệch / Khớp ✓ / LỆCH | The TK 112 guidance refers to the 'chênh lệch' between the books and the bank's figures. |
| In the ledger (column) | Trên sổ | Trên sổ | The column shows the match status and the linked entries. 'Trên sổ' is the presence form; 'theo sổ' is the balance form. |
| In the app but not on the bank statement | Có trên sổ nhưng không có trên sao kê | Chưa có trên sao kê | Reconciliation wording based on the TK 112 guidance; both drafts agree. |
| Imported statements / Undo this import / Import removed | Sao kê đã nhập / Hủy lần nhập này / Đã hủy lần nhập | Sao kê đã nhập / Hủy lần nhập | Allowed only while none of the import's lines are matched. |
| already imported, skipped | đã nhập trước đó, bỏ qua | đã nhập, bỏ qua | Common usage; both drafts agree. |
| still open / left (bank line) | còn chưa khớp / còn lại | còn lại | The part of a bank line not yet explained by matched entries. |
| on statement (ledger badge) | Đã khớp sao kê | Khớp sao kê | MISA AVA 'giao dịch đã khớp'. |
| Statement opening / Statement closing | Số dư đầu kỳ theo sao kê / Số dư cuối kỳ theo sao kê | Đầu kỳ (sao kê) / Cuối kỳ (sao kê) | TT133 'số dư đầu kỳ / cuối kỳ'. |
| Reconcile / lines to reconcile | Đối chiếu / các dòng cần đối chiếu | Đối chiếu | The TK 112 guidance uses 'đối chiếu'. |

## Accounts & financing

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Bank (account type) | Tiền gửi ngân hàng | Ngân hàng | TT133 TK 112 'Tiền gửi ngân hàng', the regime for small and medium firms. Draft A notes that TT99/2025, which replaces TT200 from 2026, renames TK 112. Firms on TT133 still use the familiar name. |
| Cash (account type) | Tiền mặt | Tiền mặt | TK 111 'Tiền mặt'. Its book is the 'Sổ quỹ tiền mặt'. |
| Owner (account type) / Owner-paid | Chủ DN (chi hộ / giữ hộ) | Chủ DN | **Owner's choice.** The balance is TK 3388 'phải trả khác' when the owner paid, and TK 1388 'phải thu khác' when the owner holds company money, detailed by owner. 'Chủ sở hữu' matches TK 4111 and the Luật Doanh nghiệp 2020 term for an LLC's owner. It also keeps this account type apart from the 'Chủ doanh nghiệp' role. Draft B used the shorter, everyday 'Chủ DN' for both. The owner should decide. |
| Term deposit / Term deposits | Tiền gửi có kỳ hạn | TG có kỳ hạn | TK 1281 'Tiền gửi có kỳ hạn'. 'Parked, not spendable' becomes 'Đang gửi có kỳ hạn, chưa chi được'. |
| Cash & bank | Tiền mặt và tiền gửi ngân hàng | Tiền mặt & ngân hàng | TK 111 + TK 112. Not 'Tiền và các khoản tương đương tiền', because term deposits are excluded. Shown per currency and never summed across currencies. |
| Owner position | Công nợ với chủ DN | Công nợ chủ DN | **Aligned with the owner's choices.** Net of TK 1388 and 3388 with the owner. Follows the owner-account decision. |
| Company owes the owner / Owner holds company money / Owed to the owner | Phải trả chủ DN (công ty nợ chủ DN) / Phải thu chủ DN (chủ DN đang giữ tiền công ty) | Phải trả chủ DN / Phải thu chủ DN | **Aligned with the owner's choices.** TK 3388 'Phải trả khác' and TK 1388 'Phải thu khác'. Used on the Accounts and Dashboard cards and on the cost-register card 'Owed to the owner' (= 'Phải trả chủ sở hữu'). Help text can use the plain wording in brackets. |
| Opening balance | Số dư đầu kỳ | Số dư đầu kỳ | The heading on TT133 book forms and on bank statements. One term is used for both an account and a statement. MISA says 'số dư ban đầu' for an account's starting balance. |
| As of date (opening date) | Ngày chốt số dư đầu kỳ | Tính đến ngày | Common usage. 'Opening … as of …' becomes 'Số dư đầu kỳ … tính đến ngày …'. |
| Balance | Số dư | Số dư | Standard term in TT133 books and on bank statements. |
| Closing balance | Số dư cuối kỳ | Số dư cuối kỳ | Standard book and statement term. The import check reads 'đầu kỳ + tiền vào − tiền ra = cuối kỳ'. |
| Active / inactive (account) | Đang sử dụng / Ngừng sử dụng | Đang dùng / Ngừng dùng | Plain and parallel. MISA uses 'Ngừng theo dõi' for inactive list items. Inactive accounts keep their history. |
| New account / Add account / Save account | Tài khoản mới / Thêm tài khoản / Lưu tài khoản | Thêm tài khoản / Lưu | Common usage. Only admins can do this. |
| Transfer / Transfer between accounts | Chuyển tiền / Chuyển tiền giữa các tài khoản | Chuyển tiền | MISA's function is 'Chuyển tiền nội bộ'; TK 113. Usage: 'Ghi nhận chuyển tiền', 'Sửa chuyển tiền'. An accountant reads a USD to VND transfer as 'bán ngoại tệ'. |
| From / To; Amount sent / Amount received | Từ tài khoản / Đến tài khoản; Số tiền chuyển đi / Số tiền nhận được | Từ / Đến; Số chuyển / Số nhận | Common usage; both drafts agree. |
| Capital contributed | Vốn đã góp | Vốn đã góp | Luật Doanh nghiệp 2020 'vốn đã góp'; TK 4111. Shown per currency, never converted. |
| Financing | Vốn góp và vay | Vốn & vay | VAS 24 puts these under 'lưu chuyển tiền từ hoạt động tài chính'. Avoid bare 'hoạt động tài chính' in the UI, because accountants link it to TK 515/635 (interest, FX). |
| Capital or loan / Record capital or loan | Vốn góp hoặc vay / Ghi nhận vốn góp hoặc vay | Vốn góp / vay | TK 4111 and TK 341. Both drafts agree. |
| Transfers, capital & loans (quick action) | Chuyển tiền, vốn góp và vay | Chuyển tiền, vốn, vay | Same words as the entry types. |
| Loans | Khoản vay | Khoản vay | TK 341 'Vay và nợ thuê tài chính', sub-account 3411. |
| Lender | Bên cho vay | Bên cho vay | Standard term in loan contracts (Bộ luật Dân sự). |
| Received / Repaid (loan) | Gốc đã nhận / Gốc đã trả | Đã nhận / Đã trả | Common usage, matching B03 'tiền trả nợ gốc vay'. |
| Outstanding (loan) | Dư nợ gốc | Dư nợ | Standard banking term 'dư nợ': principal received minus principal repaid. |
| New loan / Add loan | Khoản vay mới / Thêm khoản vay | Thêm khoản vay | Common usage; both drafts agree. |

## Exchange rates

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Currency | Loại tiền | Loại tiền | MISA field 'Loại tiền'; TT133 form S08-DNN. Totals stay separate per currency and are never added together. |
| VND value | Giá trị quy đổi VND | Quy đổi VND | Converted at the actual transaction rate ('tỷ giá giao dịch thực tế', TT133/TT200). MISA uses 'Quy đổi'. |
| Exchange rate / Rate (VND/USD) | Tỷ giá / Tỷ giá (VND/USD) | Tỷ giá | VAS 10 'tỷ giá hối đoái'. '@ rate' becomes '@ tỷ giá'; '@ … ₫/USD' stays as is. |
| Actual VND settled / VND settled (rate mode BANK) | Số VND thực tế ngân hàng ghi nhận | VND thực tế | TT133/TT200 require booking at the 'tỷ giá giao dịch thực tế'. The VND figure on the bank statement gives that rate, which makes this the most accurate mode. |
| Enter rate (rate mode MANUAL) | Nhập tỷ giá | Nhập tỷ giá | Common usage; both drafts agree. |
| Default (rate) / Default USD rate | Tỷ giá mặc định / Tỷ giá USD mặc định | Mặc định | This is an estimate only, not a 'tỷ giá giao dịch thực tế'. |
| Rate source: bank / manual / default | Nguồn tỷ giá: ngân hàng / nhập tay / mặc định | Ngân hàng / Nhập tay / Mặc định | Common usage; both drafts agree. |
| Current Rate / Set New Exchange Rate / Update Rate (Settings) | Tỷ giá hiện tại / Đặt tỷ giá mới / Cập nhật tỷ giá | Cập nhật tỷ giá | 'Hiện tại' is used because this is the app's own default, not an official rate. 'Hiện hành' would suggest an official one. |

## Cost register

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Cost register (page title, handover area) | Bảng kê chi phí | Bảng kê chi phí | 'Bảng kê' is the usual name for a supporting list (e.g. the TT80/2021 invoice listings). It also avoids 'sổ', which the app uses for the ledger ('Sổ thu chi', 'trên sổ'). Don't confuse it with Bảng kê 01/TNDN, the list of purchases without invoices. |
| Receipt (register item) | Chứng từ (hóa đơn, biên lai) của nhà cung cấp | Chứng từ | A register item may be an invoice or a receipt. 'Biên lai' is reserved for the 'Receipt only' status so invoices are not mislabelled. The item is not yet an expense. |
| Add receipt / Add to register / Receipt added to the register | Thêm chứng từ / Thêm vào bảng kê / Đã thêm chứng từ vào bảng kê | Thêm chứng từ | Follows the 'Cost register' and 'Receipt' decisions. |
| Provider | Nhà cung cấp dịch vụ | Nhà cung cấp | Common usage; both drafts agree. |
| Receipt date | Ngày chứng từ | Ngày chứng từ | Luật Kế toán Đ.16 requires the 'ngày, tháng, năm lập chứng từ'. MISA field 'Ngày chứng từ'. |
| Amount as printed | Số tiền ghi trên chứng từ | Số tiền trên CT | Amount in the receipt's own currency. |
| Service period (from / to) | Kỳ dịch vụ (từ ngày / đến ngày) | Kỳ dịch vụ | Relevant when spreading a cost over several periods (TK 242 'Chi phí trả trước'). |
| Billed to | Tên người mua trên chứng từ | Người mua | NĐ 123/2020 Đ.10 'tên, địa chỉ, mã số thuế của người mua'. The company's name and tax code must appear for it to count as a company expense. |
| Paid by: Company / Owner, personally / Not established | Người thanh toán: Công ty / Chủ DN chi hộ / Chưa xác định | Người trả | **Aligned with the owner's choices.** 'Chi hộ' is the common term; the payable to the owner is TK 3388. Follows the owner-account decision. |
| Reimbursement: Unresolved / Not needed — company paid / Company owes the owner / Reimbursed | Hoàn trả: Chưa xử lý / Không cần — công ty đã trả / Công ty còn nợ chủ DN / Đã hoàn trả | Hoàn trả | **Aligned with the owner's choices.** TK 3388 'phải trả khác'. Uses the same owner word as the account type. |
| Next renewal / renews / Renewals in the next 30 days | Ngày gia hạn tiếp theo / gia hạn ngày {date} / Gia hạn trong 30 ngày tới | Gia hạn tiếp | Common usage; both drafts agree. |
| Receipt files | Tệp chứng từ | Tệp chứng từ | They become evidence on the expense once the item is converted. |
| Pending review / Pending (cost item status PENDING) | Chờ hạch toán | Chờ hạch toán | 'Hạch toán' means recording in the books, so this is exact: registered as evidence but not yet an expense. A converted item can read 'Đã hạch toán'. It is a different status from the tax 'Chờ rà soát'. |
| Not a company cost / Not company costs (DISMISSED) | Không phải chi phí công ty | Không phải CP công ty | Luật TNDN 67/2025 Đ.9: the expense is unrelated to the business. A reason is required, and the item stays on record. |
| Back to pending / Moved back to pending | Chuyển lại chờ hạch toán / Đã chuyển lại chờ hạch toán | Mở lại | Follows the 'Pending' status. |
| To ledger | Hạch toán vào sổ | Hạch toán | 'Hạch toán' is the standard verb for recording a voucher in the books. It does not clash with 'Khóa sổ'. |
| Expense (link button) | Khoản chi | Khoản chi | Opens the expense entry the item became. Same word as the entry type. |
| Link this one / Receipt linked to the expense | Liên kết với bút toán này / Đã liên kết chứng từ với khoản chi | Liên kết | 'Liên kết' is kept for this receipt-to-expense link so it stays distinct from invoice 'đối trừ'. |
| Already in the register (duplicate) | Đã có trong bảng kê (trùng) | Trùng chứng từ | Follows the 'Cost register' decision. |
| Delete (entered by mistake) | Xóa (nhập nhầm) | Xóa | Only the owner can do this, and only for items not yet converted. |

## Projects & contacts

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Client | Khách hàng | Khách hàng | TK 131 'Phải thu của khách hàng'. |
| Vendor | Nhà cung cấp | NCC | The circular says 'người bán' (TK 331); 'nhà cung cấp' is the natural word in software (MISA). Used in the ledger export and the handover Ledger sheet. |
| Revenue (Revenue received) | Doanh thu (đã thu tiền) | Doanh thu | VAS 14 'doanh thu'. Cash basis: money actually received. |
| Spend | Đã chi | Đã chi | Expenses tagged to a vendor, in VND. |
| Project | Dự án | Dự án | Common usage; both drafts agree. |
| Project profitability / Per-project profitability / Profit by project | Lãi lỗ theo dự án | Lãi lỗ dự án | A net result per project that can be negative, so 'lãi lỗ' fits better than 'lợi nhuận'. Used for both the project page and the Reports table. |
| Top Projects by Profit | Dự án có lợi nhuận cao nhất | Dự án lãi nhất | Common usage; both drafts agree. |
| Project status: Not Started / Active / Pending / Done / Archived | Chưa bắt đầu / Đang thực hiện / Đang chờ / Hoàn thành / Đã lưu trữ | Chưa bắt đầu / Đang làm / Đang chờ / Hoàn thành / Lưu trữ | Statuses in a parallel form. 'Pending' is ambiguous: Draft B read it as on hold ('Tạm hoãn'). |
| Archive / Reactivate | Lưu trữ / Kích hoạt lại | Lưu trữ / Kích hoạt lại | Common usage; both drafts agree. |
| New project / Add / Edit project | Dự án mới / Thêm dự án / Sửa dự án | Thêm dự án / Sửa | Common usage; both drafts agree. |
| Documents / Contracts & reference files / Add document(s) / Upload / Remove / stored privately | Tài liệu / Hợp đồng và tài liệu tham khảo / Thêm tài liệu / Tải lên / Xóa / Lưu trữ riêng tư — chỉ xem được khi đã đăng nhập | Tài liệu / Tải lên / Xóa | 'Tài liệu' is used for project files so they are not confused with accounting 'chứng từ'. |
| Cost breakdown by category | Cơ cấu chi phí theo khoản mục | Chi phí theo khoản mục | Common reporting phrase; both drafts agree. |
| {n} projects · {n} invoices · {n} payments · {n} txns | {n} dự án · {n} hóa đơn · {n} lần thanh toán · {n} bút toán | {n} dự án · {n} HĐ · {n} lần TT · {n} bút toán | 'txns' follows the 'Entry' decision. |
| Unit Rates / Rate (USD) / Unit: Hours, Project, Manday | Đơn giá / Đơn giá (USD) / Đơn vị tính: Giờ, Dự án, Ngày công | Đơn giá / ĐVT | NĐ 123/2020 Đ.10 'đơn vị tính, đơn giá'; 'ngày công' is standard for man-day. |

## Reports & handover

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Profit & Loss (report title) / Profit & loss (P&L) | Báo cáo lãi lỗ / lãi lỗ | Lãi lỗ | This is an internal cash-basis view, not the statutory B02-DNN 'Báo cáo kết quả hoạt động kinh doanh' (TT133). Using the B02 name would suggest it is the statutory statement. Usage: 'không ảnh hưởng đến lãi lỗ'. |
| Cash-basis / Actual cash | Cơ sở tiền (thực thu, thực chi) | Thực thu, thực chi | The opposite of the VAS 01 'cơ sở dồn tích'. Reports subtitle: 'theo cơ sở tiền (doanh thu đã thu, chi phí đã chi)'. |
| Income / Expenses / Net Profit (cards) / Total Income / Total Expenses | Doanh thu / Chi phí / Lợi nhuận / Tổng doanh thu / Tổng chi phí | Doanh thu / Chi phí / Lợi nhuận / Tổng doanh thu / Tổng chi phí | VAS 01 elements and B02-DNN wording. P&L totals use doanh thu / chi phí, while entry types use khoản thu / khoản chi. — corrected in review: The full forms are right, but the viShort 'Tổng thu / Tổng chi' breaks the glossary's own rule that P&L totals use doanh thu / chi phí. In an app whose book is 'Sổ thu chi', 'Tổng thu' reads as all money received, including capital contributions and loans. These Dashboard KPI cards are the place where that confusion would do the most harm. |
| Net Profit | Lợi nhuận | Lợi nhuận | B02-DNN 'lợi nhuận'. Not 'sau thuế' and not 'lợi nhuận thuần', which is a specific B02 line. |
| Net Surplus | Lãi (lỗ) lũy kế | Lãi lỗ lũy kế | Both drafts agree. Hint: 'Doanh thu − Chi phí (lũy kế từ đầu)'. This is profit, not cash. Avoid 'lợi nhuận chưa phân phối' (TK 421). — corrected in review: In this glossary 'thu chi' means the whole cash book: 'Sổ thu chi' contains transfers, capital and loans. An accountant will therefore read 'Chênh lệch thu chi' as total cash receipts minus total cash payments, which is net cash flow including capital and loans. The term actually means profit, not cash, with capital and loans excluded. The term also does not match the glossary's own result wording, 'Lãi (lỗ)' for Net and 'Lãi lỗ theo dự án'. The hint ('Doanh thu − Chi phí (lũy kế từ đầu)') can stay as it is. |
| Net (column / NET line) | Lãi (lỗ) | Lãi/lỗ | Line style of B02-DNN. The 'NET' total line becomes 'LÃI (LỖ)'. |
| Total / TOTAL Income / TOTAL Expense | Tổng cộng / TỔNG DOANH THU / TỔNG CHI PHÍ | Tổng cộng | 'Tổng cộng' is the total line on TT133 forms. Matches the 'Tổng doanh thu / Tổng chi phí' cards. |
| vs last month | so với tháng trước | so tháng trước | Common usage; both drafts agree. |
| Excel downloads / Download (package) | Tải về tệp Excel / Tải về | Tải Excel / Tải về | Common usage. The handover button reads 'Tải bộ hồ sơ'. |
| Ledger entries (.xlsx) / Invoices & bills (.xlsx) | Sổ thu chi (.xlsx) / Hóa đơn bán ra & mua vào (.xlsx) | Sổ thu chi / Hóa đơn | Sheet names are 'Sổ thu chi' and 'HĐ bán ra & mua vào' (Excel limits sheet names to 31 characters). |
| From / To (date range) | Từ ngày / Đến ngày | Từ / Đến | Standard on report filters; both drafts agree. |
| Accountant handover / handover package | Bàn giao cho kế toán / Bộ hồ sơ bàn giao | Bộ hồ sơ bàn giao | Common practice of handing chứng từ to an outsourced accountant. |
| Open questions | Vấn đề cần làm rõ | Cần làm rõ | Common usage. Sheet name: 'Cần làm rõ'. |
| Workbook / sheet / Read me | Tệp Excel / Trang tính / Đọc trước | Tệp Excel / Trang tính / Đọc trước | 'Trang tính' is the term in Vietnamese Excel. 'Đọc trước' says what the tab is for, where 'Hướng dẫn' is generic. Avoid 'thuyết minh', which means the notes to the financial statements. |

## Users & security

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Owner (role, in messages) / Owner (Admin role) | Chủ doanh nghiệp | Chủ DN | The business owner who approves, posts, reverses and records tax decisions. Kept apart from 'Chủ sở hữu', the money-account type. Example: 'Chỉ chủ doanh nghiệp mới được hủy hóa đơn'. |
| Role: Admin / Staff | Vai trò: Quản trị viên / Nhân viên | Quản trị / Nhân viên | Common software usage. Staff is the code USER. |
| Unauthorized | Không có quyền thực hiện | Không có quyền | Common software usage; both drafts agree. |
| Users | Người dùng | Người dùng | Common usage; both drafts agree. |
| Invite-only | Không tự đăng ký — quản trị viên tạo tài khoản | Chỉ theo lời mời | Common usage; both drafts agree. |
| Default password / New default password / Set default password | Mật khẩu tạm / Mật khẩu tạm mới / Đặt mật khẩu tạm | Mật khẩu tạm | 'Tạm' tells the user it must be changed at the next sign-in, which 'mặc định' does not. |
| Reset password | Đặt lại mật khẩu | Đặt lại mật khẩu | Common usage; both drafts agree. |
| Reset 2FA | Đặt lại xác thực 2 bước | Đặt lại 2FA | Uses the same 2FA wording as the rest of the app. |
| Locked / Unlock (user account) | Bị khóa / Mở khóa | Bị khóa / Mở khóa | Temporary lock after 5 failed sign-ins. 'Bị khóa' keeps it apart from 'Đã khóa sổ' on entries. |
| Activate / Deactivate / Deactivated | Kích hoạt / Vô hiệu hóa / Đã vô hiệu hóa | Kích hoạt / Vô hiệu hóa | Common software usage; both drafts agree. |
| Onboarding (user status) | Đang thiết lập | Đang thiết lập | Common usage; both drafts agree. |
| Active · 2FA | Hoạt động · 2FA | Hoạt động · 2FA | Common usage; both drafts agree. |
| Delete user | Xóa người dùng | Xóa người dùng | Not allowed for yourself or for the last active admin. |
| Account (user account) | Tài khoản đăng nhập | Tài khoản | Kept apart from 'tài khoản tiền'. |
| Display name / Your name | Tên hiển thị / Tên của bạn | Tên hiển thị | Common usage; both drafts agree. |
| Member since | Tham gia từ | Tham gia từ | Reads more naturally than a literal translation. |
| Two-factor sign-in / 2FA: Enabled / Not set up | Xác thực 2 bước / 2FA: Đã bật / Chưa thiết lập | 2FA: Đã bật / Chưa thiết lập | Vietnamese banking and consumer apps commonly say 'xác thực 2 bước'. Use one form throughout the app. |
| Sign in | Đăng nhập | Đăng nhập | Matches the existing messages/vi/auth.json. |
| Sign Out / Sign out? / Yes, sign out | Đăng xuất / Đăng xuất? / Có, đăng xuất | Đăng xuất | Matches the old vi.json Common.signOut. The confirm button gets 'Có,' so it differs from the title. |
| Username / Password | Tên đăng nhập / Mật khẩu | Tên đăng nhập / Mật khẩu | Matches the existing messages/vi/auth.json. |
| 2FA Token / 2FA code | Mã xác thực 2FA | Mã 2FA | Matches the existing messages/vi/auth.json. |
| Signed out due to inactivity | Đã tự động đăng xuất do không hoạt động | Đã tự đăng xuất | Happens after 30 minutes without activity. |
| Secure your account / Finish setup | Bảo mật tài khoản / Hoàn tất thiết lập | Bảo mật / Hoàn tất | Common usage; both drafts agree. |
| Set a new password / New password / Confirm password / Save password | Đặt mật khẩu mới / Mật khẩu mới / Xác nhận mật khẩu / Lưu mật khẩu | Mật khẩu mới / Lưu | Common usage; both drafts agree. |
| Set up two-factor authentication / authenticator app / Verification code / Verify & finish | Thiết lập xác thực 2 bước / ứng dụng xác thực / Mã xác minh / Xác minh và hoàn tất | Thiết lập 2FA / Xác minh | Uses the same 2FA wording as the rest of the app. |
| Hello, {name} / Welcome, {name} | Xin chào, {name} / Chào mừng, {name} | Xin chào, {name} | Matches the old vi.json Common.welcome. |

## Actions

| English | Vietnamese | Short | Notes |
|---|---|---|---|
| Edit / Save / Save changes / Delete / Close / Add | Sửa / Lưu / Lưu thay đổi / Xóa / Đóng / Thêm | Sửa / Lưu / Xóa / Đóng / Thêm | Common software usage. 'Sửa' is used, not 'Chỉnh sửa', so buttons stay short. Posted entries cannot be deleted, and deleting a transfer deletes both sides. |
| None / No client / No project / Select client / Select vendor | Không có / Không có khách hàng / Không thuộc dự án / Chọn khách hàng / Chọn nhà cung cấp | Không có / Chọn KH / Chọn NCC | 'Không thuộc dự án' matches the entry form. |
| Manage / View all | Quản lý / Xem tất cả | Quản lý / Xem tất cả | Common usage; both drafts agree. |
| Log Income / Log Expense | Thêm khoản thu / Thêm khoản chi | Thêm thu / Thêm chi | Matches 'Thêm bút toán' and the khoản thu / khoản chi types. Avoids 'ghi', which could be read as ghi sổ. |
| Save review / Save Transaction / Update Transaction | Lưu rà soát / Lưu bút toán / Cập nhật bút toán | Lưu rà soát / Lưu / Cập nhật | Follows the 'Entry' decision. 'Lưu rà soát' saves only the evidence and tax review on an entry that is already locked. |

## Added during translation

Recurring wording settled while translating the screens.

| English | Vietnamese |
|---|---|
| Posted — locked / Open (posted — locked) | Đã ghi sổ — đã khóa / Mở (đã ghi sổ — đã khóa) |
| Could not … (error/toast) | Không thể … |
| Something went wrong (— please try again) | Đã xảy ra lỗi (— vui lòng thử lại) |
| … is required (validation) | … không được để trống. |
| Unknown account (error) | Không tìm thấy tài khoản tiền. |
| e.g. (placeholders) | Ví dụ: |
| Kept apart from the books / the P&L | Tách riêng khỏi sổ sách / lãi lỗ |
| Deductible (in running text next to VAT claimable) | được trừ khi tính thuế TNDN |
| Tag (an entry/cost to a project or vendor) / tagged to | Gắn / gắn với |
| Detach (records from a contact before deleting) | Gỡ |
| Register item (cost register) | Chứng từ trong bảng kê |
| Dismissed (register item) | Đã đánh dấu không phải chi phí công ty |
| Review (cost register receipt) | Rà soát |
| Reversal cancels (an entry) | triệt tiêu |
| History actions: Created / Changed / Approved / Posted / Reversed / Deleted / Matched / Unmatched / Linked / Unlinked | Đã tạo / Đã sửa / Đã duyệt / Đã ghi sổ / Đã đảo / Đã xóa / Đã khớp với dòng sao kê / Đã bỏ khớp dòng sao kê / Đã liên kết / Đã bỏ liên kết |
| Click (instruction) | Nhấn |
| Running balance (bank statement) | Số dư lũy kế |
| Quick Actions | Thao tác nhanh |
| Area / Item / Question / detail (handover open-questions columns) | Nhóm / Mục / Câu hỏi / chi tiết |
| Evidence files linked from each entry (handover) | Tệp chứng từ dẫn chiếu theo từng bút toán |
| Intelligence, Orchestrated. (login tagline) | Kept in English — brand slogan |
