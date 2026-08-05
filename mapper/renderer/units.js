window.units = (() => {
  const base = {
    km: { label: '公里', toKm: 1 },
    li: { label: '里', toKm: 0.5 },
    nmi: { label: '海里', toKm: 1.852 },
    mi: { label: '英里', toKm: 1.609344 }
  };

  function setLiKm(v) {
    if (v > 0) base.li.toKm = v;
  }

  function info(u) {
    return base[u] || base.km;
  }

  function list() {
    return Object.keys(base);
  }

  function toKm(v, u) {
    return v * info(u).toKm;
  }

  function fromKm(km, u) {
    return km / info(u).toKm;
  }

  function fmt(v, digits) {
    return v.toLocaleString('zh-CN', { maximumFractionDigits: digits === undefined ? 2 : digits });
  }

  function fmtLen(km, u, digits) {
    return fmt(fromKm(km, u), digits) + ' ' + info(u).label;
  }

  function fmtArea(km2, u, digits) {
    return fmt(fromKm(km2, u) / info(u).toKm, digits) + ' ' + info(u).label + '²';
  }

  return { setLiKm, info, list, toKm, fromKm, fmt, fmtLen, fmtArea };
})();
