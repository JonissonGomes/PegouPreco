import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/app_button.dart';
import 'package:pegou_preco/core/widgets/app_text_field.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class CartItemEditResult {
  const CartItemEditResult({
    required this.productName,
    required this.quantity,
    required this.retailPrice,
    this.wholesalePrice,
    this.minWholesaleQty,
  });

  final String productName;
  final double quantity;
  final double retailPrice;
  final double? wholesalePrice;
  final double? minWholesaleQty;
}

Future<CartItemEditResult?> showCartItemEditSheet(
  BuildContext context, {
  required CartItem item,
}) {
  return showModalBottomSheet<CartItemEditResult>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _CartItemEditBody(item: item),
  );
}

class _CartItemEditBody extends StatefulWidget {
  const _CartItemEditBody({required this.item});
  final CartItem item;

  @override
  State<_CartItemEditBody> createState() => _CartItemEditBodyState();
}

class _CartItemEditBodyState extends State<_CartItemEditBody> {
  late final TextEditingController _name;
  late final TextEditingController _qty;
  late final TextEditingController _price;
  late final TextEditingController _wholesale;
  late final TextEditingController _minQty;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.item.productName);
    _qty = TextEditingController(text: formatQty(widget.item.quantity));
    _price = TextEditingController(
      text: widget.item.retailPrice.toStringAsFixed(2),
    );
    _wholesale = TextEditingController(
      text: widget.item.wholesalePrice?.toStringAsFixed(2) ?? '',
    );
    _minQty = TextEditingController(
      text: widget.item.minWholesaleQty != null
          ? formatQty(widget.item.minWholesaleQty!)
          : '',
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _qty.dispose();
    _price.dispose();
    _wholesale.dispose();
    _minQty.dispose();
    super.dispose();
  }

  void _confirm() {
    final price = parseBrl(_price.text);
    final qty = double.tryParse(_qty.text.replaceAll(',', '.'));
    if (_name.text.trim().isEmpty ||
        price == null ||
        price <= 0 ||
        qty == null ||
        qty <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Informe nome, quantidade e preço válidos')),
      );
      return;
    }
    HapticFeedback.mediumImpact();
    Navigator.pop(
      context,
      CartItemEditResult(
        productName: _name.text.trim(),
        quantity: qty,
        retailPrice: price,
        wholesalePrice: _wholesale.text.trim().isEmpty
            ? null
            : parseBrl(_wholesale.text),
        minWholesaleQty: _minQty.text.trim().isEmpty
            ? null
            : double.tryParse(_minQty.text.replaceAll(',', '.')),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppTheme.pagePadding,
        8,
        AppTheme.pagePadding,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Editar item',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const Gap(16),
          AppTextField(
            controller: _name,
            label: 'Produto',
            prefixIcon: LucideIcons.package,
          ),
          const Gap(12),
          AppTextField(
            controller: _qty,
            label: 'Quantidade',
            keyboardType: TextInputType.number,
            prefixIcon: LucideIcons.hash,
          ),
          const Gap(12),
          AppTextField(
            controller: _price,
            label: 'Preço varejo',
            keyboardType: TextInputType.number,
            prefixIcon: LucideIcons.badgeDollarSign,
          ),
          const Gap(12),
          AppTextField(
            controller: _wholesale,
            label: 'Preço atacado (opcional)',
            keyboardType: TextInputType.number,
            prefixIcon: LucideIcons.tags,
          ),
          const Gap(12),
          AppTextField(
            controller: _minQty,
            label: 'Qtd mín. atacado',
            keyboardType: TextInputType.number,
            prefixIcon: LucideIcons.hash,
          ),
          const Gap(20),
          AppButton(
            label: 'Salvar',
            icon: LucideIcons.check,
            onPressed: _confirm,
          ),
          const Gap(8),
          AppButton(
            label: 'Cancelar',
            outlined: true,
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
    );
  }
}
