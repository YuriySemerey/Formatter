import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { updateBrandCategory, type BrandCategoryDefinition, type BrandQualityCategory } from "../../electron/brandCategories";

export function CategoryEditor({ categories, onChange }: { categories: BrandCategoryDefinition[]; onChange: (categories: BrandCategoryDefinition[]) => void }) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<BrandQualityCategory>();
  const [error, setError] = useState("");
  return (
    <section className="category-editor" aria-label="Категорії брендів">
      <h3>Категорії брендів</h3>
      <p>Додайте категорію або змініть її назву, потім натисніть «Зберегти». Бренди залишаться у своїх категоріях.</p>
      <form className="category-form" onSubmit={(event) => {
        event.preventDefault();
        try {
          onChange(updateBrandCategory(categories, name, editingId));
          setName(""); setEditingId(undefined); setError("");
        } catch (error) { setError(error instanceof Error ? error.message : "Не вдалося зберегти категорію."); }
      }}>
        <label>
          <span>Назва категорії</span>
          <input value={name} onChange={(event) => { setName(event.target.value); setError(""); }} type="text" />
        </label>
        <button type="submit" className="primary">{editingId ? <Pencil size={16} /> : <Plus size={16} />}{editingId ? "Застосувати назву" : "Додати категорію"}</button>
        {editingId && <button type="button" onClick={() => { setEditingId(undefined); setName(""); setError(""); }}>Скасувати перейменування</button>}
        {error && <p className="category-error" role="alert">{error}</p>}
      </form>
      <ul className="category-list">
        {categories.map((category) => <li key={category.id}>
          <span>{category.label}</span>
          <button type="button" aria-label={`Змінити назву категорії ${category.label}`} onClick={() => { setEditingId(category.id); setName(category.label); setError(""); }}><Pencil size={14} /> Змінити назву</button>
        </li>)}
      </ul>
    </section>
  );
}
