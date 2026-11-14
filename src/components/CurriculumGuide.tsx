import { AlertTriangle, BookOpen, CheckCircle2, Layers } from 'lucide-react';
import {
  AKM_FOCUS_MODES,
  ASSESSMENT_TYPES,
  DIFFICULTY_DETAILS,
  QUESTION_SUBTYPES,
} from '../utils/curriculum';
import type { DifficultyLevel } from '../types/question';

const PHASES = [
  {
    fase: 'Fase Fondasi',
    jenjang: 'PAUD / TK (4–6 Tahun)',
    fokus:
      'Observasi bermain bermakna: nilai agama & budi pekerti, jati diri, serta dasar literasi & STEAM tanpa tes hafalan kaku.',
  },
  {
    fase: 'Fase A',
    jenjang: 'SD/MI Kelas I–II',
    fokus:
      'Literasi & numerasi awal, pengenalan lingkungan konkret dengan kalimat sederhana dan stimulus visual.',
  },
  {
    fase: 'Fase B',
    jenjang: 'SD/MI Kelas III–IV',
    fokus:
      'Pemahaman konsep terstruktur, penalaran logis sederhana, dan IPAS berbasis fenomena sehari-hari.',
  },
  {
    fase: 'Fase C',
    jenjang: 'SD/MI Kelas V–VI',
    fokus:
      'Aplikasi lintas konsep, interpretasi tabel/data sederhana, dan pemecahan masalah kontekstual.',
  },
  {
    fase: 'Fase D',
    jenjang: 'SMP/MTs Kelas VII–IX',
    fokus:
      'Analisis hubungan kausal, pemodelan aljabar, penyelidikan ilmiah, dan evaluasi teks argumentatif.',
  },
  {
    fase: 'Fase E',
    jenjang: 'SMA/MA & SMK Kelas X',
    fokus:
      'Fondasi keilmuan disiplin IPA/IPS/dasar kejuruan, literasi kritis, dan studi kasus dunia nyata.',
  },
  {
    fase: 'Fase F',
    jenjang: 'SMA/MA & SMK Kelas XI–XII',
    fokus:
      'Sintesis tingkat lanjut, pemecahan masalah non-rutin (HOTS), konsentrasi keahlian SMK, dan kesiapan pasca-sekolah.',
  },
  {
    fase: 'Adaptif / Kesetaraan',
    jenjang: 'Paket A–C & SLB',
    fokus:
      'Penyesuaian usia mental, konteks kecakapan hidup fungsional, serta akomodasi instruksi aksesibel.',
  },
];

const CURRICULUM_TERMINOLOGY = [
  {
    term: 'Capaian Pembelajaran (CP)',
    scope: 'Kurikulum Merdeka',
    desc: 'Kompetensi pembelajaran yang harus dicapai peserta didik pada setiap fase perkembangan (ditetapkan per fase, bukan per pertemuan).',
  },
  {
    term: 'Tujuan Pembelajaran (TP)',
    scope: 'Kurikulum Merdeka',
    desc: 'Deskripsi pencapaian tiga aspek kompetensi (pengetahuan, keterampilan, sikap) yang diturunkan pendidik dari CP untuk satuan pembelajaran.',
  },
  {
    term: 'Alur Tujuan Pembelajaran (ATP)',
    scope: 'Kurikulum Merdeka',
    desc: 'Rangkaian TP yang tersusun secara sistematis dan logis di dalam fase pembelajaran secara utuh dari awal hingga akhir fase.',
  },
  {
    term: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)',
    scope: 'Kurikulum Merdeka',
    desc: 'Indikator atau deskripsi kriteria untuk merefleksikan ketercapaian TP (ditetapkan fleksibel oleh satuan pendidikan/guru, tidak harus satu angka KKM tunggal).',
  },
  {
    term: 'KI, KD, & IPK',
    scope: 'Kurikulum 2013 Revisi',
    desc: 'Kompetensi Inti (KI 1–4), Kompetensi Dasar (KD), dan Indikator Pencapaian Kompetensi (IPK) yang digunakan oleh sekolah pelaksana K-13.',
  },
];

const DIFF_KEYS: DifficultyLevel[] = ['Mudah', 'Sedang', 'Sulit', 'HOTS'];

export function CurriculumGuide() {
  return (
    <section aria-label="Panduan kurikulum dan standar asesmen nasional" className="space-y-6">
      {/* Banner Pengantar & Disclaimer Verifikasi */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#1E293B]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold tracking-wider text-green-700 uppercase dark:text-green-400">
              SMART QUEST GENERATOR · By Klick Assets Generator Ft. Lilin Annisa Putri S., S.Pd.
            </p>
            <h1 className="font-display mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              Panduan Penyelarasan Kurikulum, Taksonomi & Standar Asesmen Indonesia
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Sistem ini dirancang mengikuti praktik penyusunan asesmen pendidik di Indonesia
              (mengacu pada panduan pembelajaran dan asesmen Kemendikdasmen / BSKAP), mendukung
              fleksibilitas Kurikulum Merdeka, Kurikulum 2013 Revisi, maupun Kurikulum Satuan
              Pendidikan Khusus.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 text-xs leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold">
              Catatan Akurasi Kurikulum & Penafian Asesmen Nasional (AKM/ANBK)
            </p>
            <p className="mt-0.5">
              Butir soal berlabel <strong>Inspirasi AKM Literasi / Numerasi</strong> disusun untuk
              latihan pembelajaran berbasis karakteristik stimulus kontekstual dan{' '}
              <strong>bukan merupakan soal resmi pemerintah atau ANBK</strong>. Guru tetap wajib
              memverifikasi kesesuaian CP/TP/KD satuan pendidikan sebelum instrumen dicetak dan
              digunakan di kelas.
            </p>
          </div>
        </div>
      </div>

      {/* Pemetaan Fase & Kalibrasi Kesulitan */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-slate-900 dark:text-white">
            <Layers className="h-4 w-4 text-green-700 dark:text-green-400" />
            Pemetaan Fase & Jenjang Pendidikan Indonesia
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Fase</th>
                  <th className="py-2 pr-3 font-semibold">Jenjang</th>
                  <th className="py-2 font-semibold">Fokus Capaian Asesmen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {PHASES.map((row) => (
                  <tr key={row.fase}>
                    <td className="font-mono-tabular py-2.5 pr-3 font-semibold text-green-700 whitespace-nowrap dark:text-green-400">
                      {row.fase}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-800 whitespace-nowrap dark:text-slate-200">
                      {row.jenjang}
                    </td>
                    <td className="py-2.5 leading-relaxed text-slate-600 dark:text-slate-300">
                      {row.fokus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-slate-900 dark:text-white">
            <BookOpen className="h-4 w-4 text-green-700 dark:text-green-400" />
            Kalibrasi Taksonomi Bloom Revisi (C1–C6)
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Proporsi LOTS, MOTS, dan HOTS dapat diatur fleksibel sesuai tujuan asesmen dan
            karakteristik peserta didik (tidak dipatok satu rasio tunggal).
          </p>
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-700">
            {DIFF_KEYS.map((key) => {
              const info = DIFFICULTY_DETAILS[key];
              return (
                <div key={key} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {info.label}
                    </span>
                    <span className="font-mono-tabular text-xs font-medium text-slate-600 dark:text-slate-400">
                      {info.cognitiveTarget}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {info.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Perbedaan Terminologi Kurikulum Merdeka vs K-13 */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Perbedaan Terminologi Perencanaan Pembelajaran (CP, TP, ATP, KKTP vs KI/KD/IPK)
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CURRICULUM_TERMINOLOGY.map((item) => (
            <div
              key={item.term}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-[#0F172A]/70"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                  {item.term}
                </h3>
                <span className="text-[11px] font-medium text-green-700 dark:text-green-400">
                  {item.scope}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 18 Bentuk Soal, 12 Jenis Asesmen, dan Mode AKM */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            18 Ragam Bentuk Soal yang Didukung
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {QUESTION_SUBTYPES.map((sub, i) => (
              <div
                key={sub}
                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-300"
              >
                <span className="font-mono-tabular font-semibold text-green-700 dark:text-green-400">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{sub}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              12 Jenis Asesmen Sekolah
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {ASSESSMENT_TYPES.map((type) => (
                <div
                  key={type}
                  className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                  <span>{type}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Mode Khusus (AKM, Tematik SD & LKPD)
            </h2>
            <div className="mt-3 space-y-2.5">
              {AKM_FOCUS_MODES.map((mode) => (
                <div
                  key={mode.value}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-[#0F172A]"
                >
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    {mode.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                    {mode.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
