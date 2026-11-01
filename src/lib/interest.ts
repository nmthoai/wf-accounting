// Bank interest, as banks word it ("Lai nhap von", "TRA LAI TIEN GUI"). Plain
// unaccented "lai" isn't enough: "tra lai" is also a refund, and Lai a surname.
export const INTEREST = /interest|lãi|lai nhap von|tra lai tien gui|tien lai/i;

// The income category bank interest is booked under, as the app suggests naming it
// ("Bank interest", "Lãi tiền gửi ngân hàng"), with or without accents. It needs the
// bank or deposit in the name: an FX gain ("Lãi chênh lệch tỷ giá") or interest billed
// to a client is not bank interest.
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const INTEREST_CATEGORY = /\b(bank|deposit) interest\b|\blai (tien gui|ngan hang)\b|\btien lai (ngan hang|tien gui)\b/;
export const isInterestCategory = (name: string) => INTEREST_CATEGORY.test(plain(name));
