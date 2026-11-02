import Link from "next/link";
export const metadata = { title: "AI · RNAV" };
export default function Page() {
  return <main className="mx-auto max-w-3xl px-6 py-24"><h1 className="text-3xl font-semibold">RNAV AI</h1><p className="mt-6 text-slate-600">课题组智能助手正在准备中。成员和设备信息请通过管理平台维护。</p><Link className="mt-8 inline-block underline" href="/console">进入管理平台</Link></main>;
}
