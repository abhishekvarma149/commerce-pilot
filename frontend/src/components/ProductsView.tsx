import React, { useEffect, useState } from "react";
import { X, ShoppingCart, Check, Package } from "lucide-react";

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: string;
  currency: string;
  specifications: Record<string, string>;
  quantity?: number;
}

interface ProductsViewProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  onAddToCart: (product: any, isAccessory?: boolean) => void;
}

const T = {
  bg: "#ffffff",
  surface: "#f7f8fc",
  border: "#dde0ea",
  borderLight: "#eef0f6",
  textPrimary: "#1a1c2e",
  textSecondary: "#636880",
  textMuted: "#8b91a7",
  blue: "#3b5bff",
  blueBg: "#eef3ff",
  blueBorder: "#b5c8ff",
  green: "#3ecf8e",
  greenBg: "rgba(62,207,142,0.1)",
};

export const ProductsView: React.FC<ProductsViewProps> = ({
  isOpen,
  onClose,
  apiUrl,
  onAddToCart,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch(`${apiUrl}/api/products`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setProducts(data.products || []);
          }
        })
        .catch((err) => console.error("Failed to load products:", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, apiUrl]);

  if (!isOpen) return null;

  const handleAdd = (product: Product) => {
    onAddToCart(product, product.category.toLowerCase().includes("accessory"));
    setAddedIds((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [product.id]: false }));
    }, 1500);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(27,31,59,0.35)",
      backdropFilter: "blur(6px)"
    }}>
      <div style={{
        backgroundColor: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        width: "92%", maxWidth: 800,
        maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(27,31,59,0.14)",
        overflow: "hidden",
        fontFamily: "inherit"
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 24px", borderBottom: `1px solid ${T.borderLight}`,
          background: T.bg
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: T.blueBg,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <Package size={18} color={T.blue} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary }}>Product Catalog</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>Explore all available products</div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, width: 32, height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: T.textMuted, cursor: "pointer"
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Product Grid / List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: T.textMuted, padding: "40px 0", fontSize: 13 }}>
              Loading products...
            </div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.textSecondary }}>No products found.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {products.map((p) => {
                const isAccessory = p.category.toLowerCase().includes("accessory");
                return (
                  <div key={p.id} style={{
                    backgroundColor: T.surface,
                    border: `1px solid ${T.borderLight}`,
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 12
                  }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                          color: isAccessory ? T.blue : T.textSecondary,
                          background: isAccessory ? T.blueBg : T.borderLight,
                          padding: "2px 8px", borderRadius: 100
                        }}>{p.category}</span>
                        {p.quantity !== undefined && (
                          <span style={{ fontSize: 11, color: p.quantity > 0 ? T.green : "#ef4444" }}>
                            {p.quantity > 0 ? `${p.quantity} in stock` : "Out of stock"}
                          </span>
                        )}
                      </div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, margin: "8px 0 4px" }}>
                        {p.name}
                      </h4>
                      <p style={{ fontSize: 12, color: T.textSecondary, margin: 0, lineHeight: 1.4 }}>
                        {p.description}
                      </p>
                    </div>

                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderTop: `1px solid ${T.borderLight}`, paddingTop: 10, marginTop: 4
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: T.textPrimary }}>
                        ₹{Number(p.price).toLocaleString("en-IN")}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAdd(p)}
                        disabled={p.quantity !== undefined && p.quantity <= 0}
                        style={{
                          background: addedIds[p.id] ? T.greenBg : T.blue,
                          border: "none",
                          color: addedIds[p.id] ? T.green : "#ffffff",
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          transition: "background 0.15s, color 0.15s"
                        }}
                      >
                        {addedIds[p.id] ? (
                          <>
                            <Check size={14} /> Added
                          </>
                        ) : (
                          <>
                            <ShoppingCart size={14} /> Add to Cart
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
