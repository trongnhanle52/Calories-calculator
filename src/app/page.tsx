import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { Ticket, TicketHeader, TicketRow, TicketDivider, TicketTotal } from "@/components/Ticket";

const DEMO_ITEMS = [
  { name: "Cơm trắng", quantity: "1 chén (150g)", calories: 200 },
  { name: "Thịt kho trứng", quantity: "1 phần (150g)", calories: 320 },
  { name: "Canh rau muống", quantity: "1 chén (200ml)", calories: 60 },
  { name: "Trái cây tráng miệng", quantity: "1 phần", calories: 80 },
];

const STEPS = [
  {
    step: "BƯỚC 01",
    title: "Chụp khẩu phần ăn",
    body: "Chụp trực tiếp hoặc tải lên ảnh mâm cơm, tô phở, hộp cơm trưa — bất kỳ bữa ăn nào.",
  },
  {
    step: "BƯỚC 02",
    title: "AI nhận diện & tính calo",
    body: "AI thị giác nhận diện từng món ăn riêng biệt và ước tính lượng calo theo khẩu phần.",
  },
  {
    step: "BƯỚC 03",
    title: "Chỉnh sửa, lưu & theo dõi",
    body: "Sửa lại tên món hay số calo nếu cần, lưu vào lịch sử để theo dõi thói quen ăn uống.",
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const total = DEMO_ITEMS.reduce((sum, item) => sum + item.calories, 0);

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto grid max-w-5xl gap-12 px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-8">
        <div>
          <p className="font-mono text-xs font-medium tracking-[0.3em] text-marigold">
            PHIẾU TÍNH CALO TỰ ĐỘNG
          </p>
          <h1 className="mt-4 font-display text-4xl font-black leading-[1.05] tracking-tight text-cream sm:text-5xl lg:text-[3.4rem]">
            Chụp một tấm.
            <br />
            Biết ngay <span className="text-marigold">bao nhiêu calo</span>.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted sm:text-lg">
            Calo Count dùng AI để nhận diện từng món trong khẩu phần ăn của bạn và cộng tổng
            lượng calo tức thì — rõ ràng như một tấm hóa đơn quán ăn quen thuộc.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="rounded-md bg-marigold px-5 py-2.5 text-sm font-semibold text-marigold-ink shadow-lg shadow-black/20 transition-transform hover:brightness-105 active:scale-95"
            >
              Bắt đầu miễn phí
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-cream/25 px-5 py-2.5 text-sm font-semibold text-cream/90 transition-colors hover:border-cream/50 hover:text-cream"
            >
              Tôi đã có tài khoản
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm">
          <Ticket tilt="left" animate>
            <TicketHeader title="Bữa trưa của bạn" dateLabel="24/07 · 12:14" />
            <div className="space-y-3">
              {DEMO_ITEMS.map((item, i) => (
                <TicketRow key={item.name} {...item} animate delay={150 + i * 90} />
              ))}
            </div>
            <TicketDivider />
            <TicketTotal total={total} />
          </Ticket>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-cream/10 bg-bg-raised/40 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-xl font-extrabold text-cream sm:text-2xl">
            Ba bước, không cần tính toán thủ công
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.step} className="border-l-2 border-marigold/60 pl-4">
                <p className="font-mono text-xs font-semibold tracking-[0.2em] text-marigold">
                  {s.step}
                </p>
                <h3 className="mt-2 font-display text-base font-bold text-cream">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="px-4 py-8 text-center text-xs text-muted sm:px-6">
        Calo Count — theo dõi calo mỗi bữa ăn, dễ như xé một tấm phiếu.
      </footer>
    </div>
  );
}
