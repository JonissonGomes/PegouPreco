import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/app_button.dart';
import 'package:pegou_preco/core/widgets/app_text_field.dart';
import 'package:pegou_preco/features/vision/models/review_item.dart';

Future<ReviewItem?> showOcrConfirmSheet(
  BuildContext context, {
  required ReviewItem item,
}) {
  return showModalBottomSheet<ReviewItem>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _OcrConfirmBody(item: item),
  );
}

class _OcrConfirmBody extends StatefulWidget {
  const _OcrConfirmBody({required this.item});
  final ReviewItem item;

  @override
  State<_OcrConfirmBody> createState() => _OcrConfirmBodyState();
}

class _OcrConfirmBodyState extends State<_OcrConfirmBody> {
  late final TextEditingController _name;
  late final TextEditingController _price;
  late final TextEditingController _wholesale;
  late final TextEditingController _minQty;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.item.description);
    _price = TextEditingController(
      text: widget.item.unitPrice.toStringAsFixed(2),
    );
    _wholesale = TextEditingController(
      text: widget.item.wholesalePrice?.toStringAsFixed(2) ?? '',
    );
    _minQty = TextEditingController(
      text: widget.item.minWholesaleQty?.toString() ?? '',
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _wholesale.dispose();
    _minQty.dispose();
    super.dispose();
  }

  void _confirm() {
    final price = parseBrl(_price.text);
    if (_name.text.trim().isEmpty || price == null || price <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Informe nome e preço válidos')),
      );
      return;
    }
    HapticFeedback.mediumImpact();
    Navigator.pop(
      context,
      widget.item.copyWith(
        description: _name.text.trim(),
        unitPrice: price,
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
            'Confirmar etiqueta',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const Gap(4),
          Text(
            'Ajuste o que o OCR leu antes de salvar.',
            style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
          ),
          const Gap(16),
          AppTextField(
            controller: _name,
            label: 'Produto',
            prefixIcon: LucideIcons.package,
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
            label: 'Salvar preço',
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
