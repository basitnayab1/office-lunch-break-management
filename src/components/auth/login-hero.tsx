import Image from "next/image";
import { DashboardPreview } from "@/components/auth/dashboard-preview";
import { BiteStationBrand } from "@/components/brand/bite-station-logo";

export function LoginHero() {
  return (
    <>
      {/* Tablet: compact branded banner */}
      <section className="relative hidden h-56 overflow-hidden md:block lg:hidden">
        <Image
          src="/branding/lunch-break-room.png"
          alt="Bite Station lounge"
          fill
          className="object-cover object-[center_35%]"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 to-black/25" />
        <div className="absolute inset-0 flex items-end justify-between p-6">
          <div className="text-white">
            <BiteStationBrand logoSize={52} showTagline inverted />
          </div>
          <div className="flex items-end gap-3">
            <div className="w-24 overflow-hidden rounded-xl border-2 border-black/80 bg-black shadow-xl">
              <div className="aspect-[3/4]">
                <DashboardPreview compact />
              </div>
            </div>
            <div className="w-16 overflow-hidden rounded-2xl border-2 border-black/80 bg-black shadow-xl">
              <div className="aspect-[9/16]">
                <DashboardPreview compact />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Desktop: full split visual with devices */}
      <section className="relative hidden h-full min-h-screen overflow-hidden lg:block">
        <Image
          src="/branding/lunch-break-room.png"
          alt="Bite Station — Eat, Relax, Recharge"
          fill
          priority
          className="object-cover object-center"
          sizes="(min-width: 1024px) 55vw, 100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-black/10" />

        <div className="absolute inset-0 flex flex-col justify-between p-8 xl:p-10">
          <div className="animate-rise">
            <BiteStationBrand logoSize={64} showTagline inverted />
          </div>

          <div className="relative mx-auto w-full max-w-3xl pb-6 pt-10">
            <div className="animate-rise relative mx-auto w-[72%] max-w-[520px] [animation-delay:80ms]">
              <div className="rounded-[18px] border border-[#2a2a2a] bg-[#1a1a1a] p-2 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="overflow-hidden rounded-[12px] bg-[#0d0d0d]">
                  <div className="flex h-5 items-center gap-1.5 bg-[#151515] px-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#febc2e]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]" />
                  </div>
                  <div className="aspect-[16/10]">
                    <DashboardPreview />
                  </div>
                </div>
              </div>
              <div className="mx-auto h-2 w-[78%] rounded-b-md bg-[#cfcfcf]" />
              <div className="mx-auto h-1 w-[88%] rounded-b-lg bg-[#a8a8a8]" />
            </div>

            <div className="animate-rise absolute bottom-[8%] left-[-2%] w-[28%] max-w-[180px] [animation-delay:160ms]">
              <div className="rounded-[22px] border-[3px] border-[#1c1c1c] bg-[#111] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
                <div className="overflow-hidden rounded-[16px] bg-white">
                  <div className="aspect-[3/4]">
                    <DashboardPreview />
                  </div>
                </div>
              </div>
            </div>

            <div className="animate-rise absolute bottom-[4%] right-[2%] w-[18%] max-w-[110px] [animation-delay:240ms]">
              <div className="rounded-[22px] border-[3px] border-[#1c1c1c] bg-[#111] p-1 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                <div className="mx-auto mb-1 mt-0.5 h-1 w-8 rounded-full bg-[#333]" />
                <div className="overflow-hidden rounded-[16px] bg-white">
                  <div className="aspect-[9/16]">
                    <DashboardPreview compact />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="animate-rise text-sm text-white/80 [animation-delay:200ms]">
            Manage breakfast, coffee, and lunch breaks in one calm workspace.
          </p>
        </div>
      </section>
    </>
  );
}
