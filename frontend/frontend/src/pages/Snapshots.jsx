import { Expand, Image as ImageIcon, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import PageHeader from "../components/common/PageHeader";
import { deleteSnapshot, getSnapshots } from "../services/snapshotService";

export default function Snapshots() {
  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [search, setSearch] = useState("");

  async function loadImages() {
    try {
      setImages(await getSnapshots());
    } catch (error) {
      console.error(error);
      toast.error("Could not load snapshots.");
    }
  }

  useEffect(() => {
    const initialTimer = window.setTimeout(loadImages, 0);
    return () => window.clearTimeout(initialTimer);
  }, []);

  const filteredImages = useMemo(
    () =>
      images.filter((image) =>
        image.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [images, search],
  );

  async function handleDelete(filename) {
    if (!window.confirm("Delete this snapshot and its related alert?")) return;

    try {
      await deleteSnapshot(filename);
      await loadImages();
      toast.success("Snapshot deleted.");
    } catch {
      toast.error("Snapshot could not be deleted.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Visual evidence"
        title="Snapshot gallery"
        description="Browse images automatically captured when SentiGuard detects a crowd or behavior risk."
      />

      <label className="mb-6 flex max-w-xl items-center gap-2 rounded-xl border border-slate-700 bg-[#0c1728] px-4">
        <Search size={17} className="text-slate-600" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search snapshot filename"
          className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-600"
        />
      </label>

      {filteredImages.length ? (
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredImages.map((image) => (
            <article
              key={image.name}
              className="group overflow-hidden rounded-2xl border border-slate-800 bg-[#0c1728]"
            >
              <div className="relative aspect-video overflow-hidden bg-slate-950">
                <img
                  src={image.url}
                  alt={image.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
                <button
                  type="button"
                  onClick={() => setSelectedImage(image)}
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg bg-slate-950/75 text-slate-200 opacity-0 backdrop-blur transition group-hover:opacity-100"
                >
                  <Expand size={16} />
                </button>
              </div>

              <div className="flex items-center gap-3 p-4">
                <ImageIcon size={18} className="shrink-0 text-cyan-300" />
                <p className="min-w-0 flex-1 truncate text-sm text-slate-300">
                  {image.name}
                </p>
                <button
                  type="button"
                  onClick={() => handleDelete(image.name)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-rose-400/20 text-rose-400 transition hover:bg-rose-400/10"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-700 bg-[#0c1728] px-6 py-20 text-center">
          <ImageIcon className="mx-auto text-slate-700" size={44} />
          <p className="mt-4 font-medium text-slate-300">No snapshots found</p>
          <p className="mt-2 text-sm text-slate-600">
            Danger snapshots will appear here automatically.
          </p>
        </section>
      )}

      {selectedImage && (
        <button
          type="button"
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/90 p-4 backdrop-blur-sm"
        >
          <img
            src={selectedImage.url}
            alt={selectedImage.name}
            className="max-h-[90vh] max-w-[94vw] rounded-2xl border border-slate-700 object-contain shadow-2xl"
          />
        </button>
      )}
    </>
  );
}
